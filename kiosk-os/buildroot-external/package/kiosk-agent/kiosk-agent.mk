################################################################################
#
# kiosk-agent
#
################################################################################

KIOSK_AGENT_VERSION = 1.0.0
KIOSK_AGENT_SITE_METHOD = local
KIOSK_AGENT_SITE = $(BR2_EXTERNAL_KIOSK_PATH)/../../services
KIOSK_AGENT_LICENSE = MIT
KIOSK_AGENT_DEPENDENCIES = python3

define KIOSK_AGENT_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0755 $(@D)/kiosk-agent.py $(TARGET_DIR)/usr/bin/kiosk-agent
	$(INSTALL) -D -m 0644 $(@D)/kiosk-agent.service $(TARGET_DIR)/etc/systemd/system/kiosk-agent.service
endef

$(eval $(generic-package))
