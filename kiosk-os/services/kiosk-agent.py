#!/usr/bin/env python3
"""
Kiosk Agent - Main communication agent between kiosk device and management server
"""

import asyncio
import json
import logging
import os
import sys
import time
import uuid
from configparser import ConfigParser
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List

import aiohttp
import websockets
from cryptography.fernet import Fernet


class KioskAgent:
    """Main kiosk agent class"""
    
    def __init__(self, config_file: str = '/etc/kiosk/management.conf'):
        self.config_file = config_file
        self.config = ConfigParser()
        self.device_id = None
        self.session = None
        self.websocket = None
        self.running = False
        self.logger = self._setup_logging()
        self.encryption_key = None
        
        # Load configuration
        self.load_config()
        
        # Initialize device ID
        self.device_id = self._get_or_create_device_id()
        
        # Setup encryption
        self._setup_encryption()
        
    def _setup_logging(self) -> logging.Logger:
        """Setup logging configuration"""
        logger = logging.getLogger('kiosk-agent')
        logger.setLevel(logging.INFO)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        
        # File handler
        log_file = '/var/log/kiosk/kiosk-agent.log'
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.DEBUG)
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler.setFormatter(formatter)
        file_handler.setFormatter(formatter)
        
        logger.addHandler(console_handler)
        logger.addHandler(file_handler)
        
        return logger
        
    def load_config(self):
        """Load configuration from file"""
        try:
            self.config.read(self.config_file)
            self.logger.info(f"Configuration loaded from {self.config_file}")
        except Exception as e:
            self.logger.error(f"Failed to load configuration: {e}")
            sys.exit(1)
            
    def _get_or_create_device_id(self) -> str:
        """Get or create unique device ID"""
        device_id = self.config.get('server', 'device_id', fallback='')
        
        if not device_id:
            # Generate unique device ID based on hardware
            device_id = self._generate_device_id()
            
            # Save to config file
            self.config.set('server', 'device_id', device_id)
            with open(self.config_file, 'w') as f:
                self.config.write(f)
                
        return device_id
        
    def _generate_device_id(self) -> str:
        """Generate unique device ID"""
        try:
            # Try to use hardware-based ID
            machine_id_file = '/etc/machine-id'
            if os.path.exists(machine_id_file):
                with open(machine_id_file, 'r') as f:
                    machine_id = f.read().strip()
                    return f"kiosk-{machine_id[:8]}"
            
            # Fallback to MAC address
            import subprocess
            result = subprocess.run(['ip', 'link', 'show'], capture_output=True, text=True)
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'link/ether' in line:
                        mac = line.split()[1].replace(':', '')
                        return f"kiosk-{mac[:8]}"
                        
        except Exception as e:
            self.logger.warning(f"Failed to generate hardware-based ID: {e}")
            
        # Final fallback to random UUID
        return f"kiosk-{str(uuid.uuid4())[:8]}"
        
    def _setup_encryption(self):
        """Setup encryption for secure communication"""
        if not self.config.getboolean('security', 'encrypt_storage', fallback=False):
            return
            
        key_file = self.config.get('security', 'encryption_key_file', 
                                 fallback='/etc/kiosk/encryption.key')
        
        try:
            if os.path.exists(key_file):
                with open(key_file, 'rb') as f:
                    self.encryption_key = f.read()
            else:
                # Generate new key
                self.encryption_key = Fernet.generate_key()
                os.makedirs(os.path.dirname(key_file), exist_ok=True)
                with open(key_file, 'wb') as f:
                    f.write(self.encryption_key)
                os.chmod(key_file, 0o600)
                    
        except Exception as e:
            self.logger.error(f"Failed to setup encryption: {e}")
            
    def encrypt_data(self, data: str) -> str:
        """Encrypt sensitive data"""
        if not self.encryption_key:
            return data
            
        try:
            fernet = Fernet(self.encryption_key)
            encrypted = fernet.encrypt(data.encode())
            return encrypted.decode()
        except Exception as e:
            self.logger.error(f"Encryption failed: {e}")
            return data
            
    def decrypt_data(self, encrypted_data: str) -> str:
        """Decrypt sensitive data"""
        if not self.encryption_key:
            return encrypted_data
            
        try:
            fernet = Fernet(self.encryption_key)
            decrypted = fernet.decrypt(encrypted_data.encode())
            return decrypted.decode()
        except Exception as e:
            self.logger.error(f"Decryption failed: {e}")
            return encrypted_data
            
    async def get_system_info(self) -> Dict[str, Any]:
        """Collect system information"""
        info = {
            'device_id': self.device_id,
            'hostname': os.uname().nodename,
            'kernel': os.uname().release,
            'architecture': os.uname().machine,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        
        try:
            # CPU information
            with open('/proc/cpuinfo', 'r') as f:
                cpu_info = f.read()
                info['cpu_model'] = 'Unknown'
                for line in cpu_info.split('\n'):
                    if line.startswith('model name'):
                        info['cpu_model'] = line.split(':')[1].strip()
                        break
                        
            # Memory information
            with open('/proc/meminfo', 'r') as f:
                mem_info = f.read()
                for line in mem_info.split('\n'):
                    if line.startswith('MemTotal:'):
                        info['memory_total'] = int(line.split()[1]) * 1024  # Convert to bytes
                    elif line.startswith('MemAvailable:'):
                        info['memory_available'] = int(line.split()[1]) * 1024
                        
            # Disk information
            import shutil
            disk_usage = shutil.disk_usage('/')
            info['disk_total'] = disk_usage.total
            info['disk_free'] = disk_usage.free
            info['disk_used'] = disk_usage.used
            
            # Network interfaces
            import subprocess
            result = subprocess.run(['ip', 'addr', 'show'], capture_output=True, text=True)
            if result.returncode == 0:
                info['network_interfaces'] = self._parse_network_interfaces(result.stdout)
                
            # Load average
            with open('/proc/loadavg', 'r') as f:
                load_avg = f.read().strip().split()
                info['load_average'] = {
                    '1min': float(load_avg[0]),
                    '5min': float(load_avg[1]),
                    '15min': float(load_avg[2])
                }
                
            # Temperature (if available)
            temp_files = [
                '/sys/class/thermal/thermal_zone0/temp',
                '/sys/class/hwmon/hwmon0/temp1_input'
            ]
            for temp_file in temp_files:
                if os.path.exists(temp_file):
                    with open(temp_file, 'r') as f:
                        temp = int(f.read().strip())
                        info['temperature'] = temp / 1000.0  # Convert to Celsius
                        break
                        
        except Exception as e:
            self.logger.error(f"Failed to collect system info: {e}")
            
        return info
        
    def _parse_network_interfaces(self, ip_output: str) -> List[Dict[str, Any]]:
        """Parse network interface information"""
        interfaces = []
        current_interface = None
        
        for line in ip_output.split('\n'):
            line = line.strip()
            
            if line and not line.startswith(' '):
                # New interface
                parts = line.split(':')
                if len(parts) >= 2:
                    if current_interface:
                        interfaces.append(current_interface)
                    
                    current_interface = {
                        'name': parts[1].strip(),
                        'state': 'DOWN',
                        'addresses': []
                    }
                    
                    if 'UP' in line:
                        current_interface['state'] = 'UP'
                        
            elif line.startswith('inet ') and current_interface:
                # IP address
                addr_parts = line.split()
                if len(addr_parts) >= 2:
                    current_interface['addresses'].append({
                        'type': 'ipv4',
                        'address': addr_parts[1]
                    })
                    
            elif line.startswith('inet6 ') and current_interface:
                # IPv6 address
                addr_parts = line.split()
                if len(addr_parts) >= 2:
                    current_interface['addresses'].append({
                        'type': 'ipv6',
                        'address': addr_parts[1]
                    })
                    
        if current_interface:
            interfaces.append(current_interface)
            
        return interfaces
        
    async def send_heartbeat(self):
        """Send heartbeat to management server"""
        if not self.session:
            return
            
        try:
            server_url = self.config.get('server', 'url')
            api_path = self.config.get('server', 'api_path', fallback='/api')
            api_key = self.config.get('server', 'api_key', fallback='')
            
            url = f"{server_url}{api_path}/devices/{self.device_id}/heartbeat"
            
            # Collect system information
            system_info = await self.get_system_info()
            
            headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'KioskAgent/1.0'
            }
            
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'
                
            async with self.session.post(url, json=system_info, headers=headers) as response:
                if response.status == 200:
                    self.logger.debug("Heartbeat sent successfully")
                    
                    # Process any commands from server
                    try:
                        response_data = await response.json()
                        if 'commands' in response_data:
                            await self.process_commands(response_data['commands'])
                    except Exception as e:
                        self.logger.error(f"Failed to process server response: {e}")
                        
                else:
                    self.logger.error(f"Heartbeat failed: HTTP {response.status}")
                    
        except Exception as e:
            self.logger.error(f"Failed to send heartbeat: {e}")
            
    async def process_commands(self, commands: List[Dict[str, Any]]):
        """Process commands from management server"""
        for command in commands:
            try:
                command_type = command.get('type')
                self.logger.info(f"Processing command: {command_type}")
                
                if command_type == 'restart':
                    await self.restart_system()
                elif command_type == 'update':
                    await self.update_system(command.get('data', {}))
                elif command_type == 'install_app':
                    await self.install_application(command.get('data', {}))
                elif command_type == 'uninstall_app':
                    await self.uninstall_application(command.get('data', {}))
                elif command_type == 'configure':
                    await self.configure_system(command.get('data', {}))
                else:
                    self.logger.warning(f"Unknown command type: {command_type}")
                    
            except Exception as e:
                self.logger.error(f"Failed to process command {command.get('type')}: {e}")
                
    async def restart_system(self):
        """Restart the system"""
        self.logger.info("System restart requested")
        import subprocess
        subprocess.run(['sudo', 'systemctl', 'reboot'])
        
    async def update_system(self, data: Dict[str, Any]):
        """Update system"""
        self.logger.info("System update requested")
        # Implementation depends on update mechanism
        pass
        
    async def install_application(self, data: Dict[str, Any]):
        """Install application"""
        app_name = data.get('name')
        app_url = data.get('url')
        self.logger.info(f"Installing application: {app_name}")
        # Implementation depends on application format (container, package, etc.)
        pass
        
    async def uninstall_application(self, data: Dict[str, Any]):
        """Uninstall application"""
        app_name = data.get('name')
        self.logger.info(f"Uninstalling application: {app_name}")
        # Implementation depends on application format
        pass
        
    async def configure_system(self, data: Dict[str, Any]):
        """Configure system settings"""
        self.logger.info("System configuration update requested")
        # Implementation depends on configuration format
        pass
        
    async def connect_websocket(self):
        """Connect to management server via WebSocket"""
        try:
            server_url = self.config.get('server', 'url')
            api_key = self.config.get('server', 'api_key', fallback='')
            
            # Convert HTTP URL to WebSocket URL
            ws_url = server_url.replace('http://', 'ws://').replace('https://', 'wss://')
            ws_url = f"{ws_url}/ws/devices/{self.device_id}"
            
            headers = {}
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'
                
            async with websockets.connect(ws_url, extra_headers=headers) as websocket:
                self.websocket = websocket
                self.logger.info("WebSocket connected")
                
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        await self.handle_websocket_message(data)
                    except Exception as e:
                        self.logger.error(f"Failed to process WebSocket message: {e}")
                        
        except Exception as e:
            self.logger.error(f"WebSocket connection failed: {e}")
            
    async def handle_websocket_message(self, data: Dict[str, Any]):
        """Handle WebSocket message from server"""
        message_type = data.get('type')
        
        if message_type == 'command':
            await self.process_commands([data.get('data', {})])
        elif message_type == 'ping':
            # Respond to ping
            await self.websocket.send(json.dumps({'type': 'pong'}))
        else:
            self.logger.warning(f"Unknown WebSocket message type: {message_type}")
            
    async def run(self):
        """Main run loop"""
        self.logger.info(f"Starting Kiosk Agent for device {self.device_id}")
        self.running = True
        
        # Create HTTP session
        timeout = aiohttp.ClientTimeout(
            connect=self.config.getint('server', 'connect_timeout', fallback=30),
            total=self.config.getint('server', 'read_timeout', fallback=60)
        )
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            self.session = session
            
            # Start heartbeat task
            heartbeat_interval = self.config.getint('server', 'heartbeat_interval', fallback=60)
            heartbeat_task = asyncio.create_task(self.heartbeat_loop(heartbeat_interval))
            
            # Start WebSocket connection task
            websocket_task = asyncio.create_task(self.websocket_loop())
            
            try:
                # Wait for tasks to complete
                await asyncio.gather(heartbeat_task, websocket_task)
            except KeyboardInterrupt:
                self.logger.info("Shutdown requested")
                self.running = False
                heartbeat_task.cancel()
                websocket_task.cancel()
                
    async def heartbeat_loop(self, interval: int):
        """Heartbeat loop"""
        while self.running:
            try:
                await self.send_heartbeat()
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Heartbeat loop error: {e}")
                await asyncio.sleep(interval)
                
    async def websocket_loop(self):
        """WebSocket connection loop with reconnection"""
        while self.running:
            try:
                await self.connect_websocket()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"WebSocket loop error: {e}")
                await asyncio.sleep(30)  # Wait before reconnecting


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Kiosk Agent')
    parser.add_argument('--config', '-c', default='/etc/kiosk/management.conf',
                       help='Configuration file path')
    parser.add_argument('--debug', '-d', action='store_true',
                       help='Enable debug logging')
    
    args = parser.parse_args()
    
    # Create agent
    agent = KioskAgent(args.config)
    
    if args.debug:
        agent.logger.setLevel(logging.DEBUG)
        
    # Run agent
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        agent.logger.info("Agent stopped by user")
    except Exception as e:
        agent.logger.error(f"Agent crashed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
