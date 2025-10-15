package com.vetclinic.pdf.constants;

public enum DeviceType {
    EXIGO(1, "EXIGO"),
    POINTCARE(2, "POINTCARE"),
    HEALVET(3, "HEALVET");

    private int deviceId;
    private String deviceName;

    DeviceType(int deviceId, String deviceName) {
        this.deviceId = deviceId;
        this.deviceName = deviceName;
    }

    public int getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(int deviceId) {
        this.deviceId = deviceId;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public void setDeviceName(String deviceName) {
        this.deviceName = deviceName;
    }

    public static String getDeviceNameById(int deviceId) {

        if(deviceId == EXIGO.deviceId) {
            return EXIGO.deviceName;
        } else if (deviceId == POINTCARE.deviceId) {
            return POINTCARE.deviceName;
        } else if (deviceId == HEALVET.deviceId) {
            return HEALVET.deviceName;
        }

        return null;
    }
}
