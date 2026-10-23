package com.vetclinic.pdf.models;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * The clinic's own details from the app's settings. Every field may be
 * blank; a blank field keeps the text baked into the letterhead.
 */
public class ClinicProfile {

    public final String name;
    public final String address;
    public final String city;
    public final String phone;
    public final String email;
    public final String taxNumber;
    public final String registrationNumber;
    public final String bankAccount;
    public final String bankName;
    public final String logoPath;

    public ClinicProfile(String name, String address, String city, String phone, String email,
                         String taxNumber, String registrationNumber, String bankAccount,
                         String bankName, String logoPath) {
        this.name = clean(name);
        this.address = clean(address);
        this.city = clean(city);
        this.phone = clean(phone);
        this.email = clean(email);
        this.taxNumber = clean(taxNumber);
        this.registrationNumber = clean(registrationNumber);
        this.bankAccount = clean(bankAccount);
        this.bankName = clean(bankName);
        this.logoPath = clean(logoPath);
    }

    public static ClinicProfile empty() {
        return new ClinicProfile(null, null, null, null, null, null, null, null, null, null);
    }

    /** The optional `clinic` object of the CLI input. */
    public static ClinicProfile fromJson(JsonObject input) {
        if (input == null || !input.has("clinic") || !input.get("clinic").isJsonObject()) {
            return empty();
        }
        JsonObject c = input.getAsJsonObject("clinic");
        return new ClinicProfile(str(c, "name"), str(c, "address"), str(c, "city"), str(c, "phone"),
                str(c, "email"), str(c, "tax_number"), str(c, "registration_number"),
                str(c, "bank_account"), str(c, "bank_name"), str(c, "logo_path"));
    }

    public boolean hasContact() {
        return name != null || address != null || city != null || phone != null || email != null;
    }

    public boolean hasBankDetails() {
        return taxNumber != null || registrationNumber != null || bankAccount != null || bankName != null;
    }

    public boolean hasLogo() {
        return logoPath != null;
    }

    public static String or(String value, String fallback) {
        return value != null ? value : fallback;
    }

    private static String str(JsonObject o, String key) {
        JsonElement e = o.get(key);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }

    private static String clean(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
