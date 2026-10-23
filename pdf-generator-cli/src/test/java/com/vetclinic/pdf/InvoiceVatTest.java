package com.vetclinic.pdf;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InvoiceVatTest {

    static JsonObject item(String name, double price, String vatLabel, double vatPercent) {
        JsonObject item = new JsonObject();
        item.addProperty("name", name);
        item.addProperty("quantity", 1);
        item.addProperty("unit_price", price);
        item.addProperty("vat_label", vatLabel);
        item.addProperty("vat_percent", vatPercent);
        return item;
    }

    static JsonObject group(String label, double percent, double net, double vat, double gross) {
        JsonObject g = new JsonObject();
        g.addProperty("label", label);
        g.addProperty("percent", percent);
        g.addProperty("net", net);
        g.addProperty("vat", vat);
        g.addProperty("gross", gross);
        return g;
    }

    /** Two items priced with VAT included: 1180 at 18% and 1050 at 5%. */
    static JsonObject vatInvoice() {
        JsonObject in = InvoiceRenderTest.invoice(0, 0);
        JsonArray items = new JsonArray();
        items.add(item("Операција", 1180, "ДДВ 18%", 18));
        items.add(item("Лек", 1050, "ДДВ 5%", 5));
        in.add("line_items", items);

        JsonObject totals = new JsonObject();
        totals.addProperty("subtotal", 2230);
        totals.addProperty("discount_amount", 0);
        totals.addProperty("total", 2230);
        totals.addProperty("vat_total", 230);
        totals.addProperty("prices_include_vat", true);
        JsonArray groups = new JsonArray();
        groups.add(group("ДДВ 18%", 18, 1000, 180, 1180));
        groups.add(group("ДДВ 5%", 5, 1000, 50, 1050));
        totals.add("vat_groups", groups);
        in.add("totals", totals);
        return in;
    }

    static String render(JsonObject in) throws Exception {
        return InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(in)).replaceAll("\\s+", " ");
    }

    @Test
    void anInvoiceWithVatShowsNetVatAndGrossPerRate() throws Exception {
        String text = render(vatInvoice());
        assertTrue(text.contains("ДДВ 18%"), text);
        assertTrue(text.contains("ДДВ 5%"), text);
        assertTrue(text.contains("Основица"), text);
        assertTrue(text.contains(" 180 ден"), text);
        assertTrue(text.contains(" 50 ден"), text);
        assertTrue(text.contains("230 ден"), text);
        assertTrue(text.contains("За наплата"), text);
        assertTrue(text.contains("2230 ден"), text);
    }

    @Test
    void theTotalsComeFromTheAppNotFromJava() throws Exception {
        JsonObject in = InvoiceRenderTest.invoice(2, 10);
        JsonObject totals = new JsonObject();
        totals.addProperty("subtotal", 200);
        totals.addProperty("discount_amount", 21);
        totals.addProperty("total", 179);
        totals.addProperty("vat_total", 0);
        totals.addProperty("prices_include_vat", true);
        totals.add("vat_groups", new JsonArray());
        in.add("totals", totals);
        String text = render(in);
        assertTrue(text.contains("-21 ден"), text);
        assertTrue(text.contains("179 ден"), text);
    }

    @Test
    void anInvoiceWithoutRatesHasNoVatSection() throws Exception {
        String text = render(InvoiceRenderTest.invoice(2, 0));
        assertFalse(text.contains("Основица"), text);
        assertFalse(text.contains("ДДВ"), text);
    }

    @Test
    void netPricesAddTheVatBeforeTheAmountDue() throws Exception {
        JsonObject in = vatInvoice();
        JsonArray items = new JsonArray();
        items.add(item("Операција", 1000, "ДДВ 18%", 18));
        items.add(item("Лек", 1000, "ДДВ 5%", 5));
        in.add("line_items", items);
        JsonObject totals = in.getAsJsonObject("totals");
        totals.addProperty("subtotal", 2000);
        totals.addProperty("prices_include_vat", false);
        String text = render(in);
        assertTrue(text.contains("2000 ден"), text);
        assertTrue(text.contains("+230 ден"), text);
        assertTrue(text.contains("2230 ден"), text);
    }
}
