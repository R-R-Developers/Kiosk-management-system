include $(sort $(wildcard $(BR2_EXTERNAL_KIOSK_PATH)/package/*/*.mk))
include $(sort $(wildcard $(BR2_EXTERNAL_KIOSK_PATH)/boot/*/*.mk))
include $(sort $(wildcard $(BR2_EXTERNAL_KIOSK_PATH)/linux/*/*.mk))
include $(sort $(wildcard $(BR2_EXTERNAL_KIOSK_PATH)/fs/*/*.mk))
