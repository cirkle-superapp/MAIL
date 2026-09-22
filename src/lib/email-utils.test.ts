import { describe, it, expect } from "bun:test";
import {
  classifyIntent,
  detectCommitments,
  sanitizeEmailHtml,
  deriveCategory,
  dateBucket,
  getInitials,
  makeSnippet,
  textToHtml,
} from "./email-utils";

describe("classifyIntent", () => {
  it("classifies an invoice email as INVOICE", () => {
    const r = classifyIntent({
      fromEmail: "billing@acme.io",
      fromName: "Acme Billing",
      subject: "Your August invoice is ready (INV-20418)",
      snippet: "Your invoice for August is ready. Amount due $240.",
      body: "Invoice #INV-20418. Amount due: $240. Payment due Sep 15.",
    });
    expect(r.intent).toBe("INVOICE");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies a question directed at the user as REQUIRES_REPLY", () => {
    const r = classifyIntent({
      fromEmail: "priya@northwind.design",
      fromName: "Priya Sharma",
      subject: "Can you review the mockups?",
      snippet: "Can you give the attachment a quick look before our 3pm sync?",
      body: "Could you review the mockups before 3pm? Let me know if anything looks off.",
    });
    expect(r.intent).toBe("REQUIRES_REPLY");
  });

  it("classifies a security alert", () => {
    const r = classifyIntent({
      fromEmail: "security@x.com",
      fromName: "Security",
      subject: "Verify your identity",
      snippet: "We noticed a new sign-in. Verify it's you.",
      body: "Verify your identity. Security alert: unusual sign-in activity. 2FA required.",
    });
    expect(r.intent).toBe("SECURITY_ALERT");
  });

  it("classifies a newsletter", () => {
    const r = classifyIntent({
      fromEmail: "hello@weeklybyte.dev",
      fromName: "The Weekly Byte",
      subject: "5 frontend patterns that aged like milk",
      snippet: "This week in frontend. Unsubscribe.",
      body: "This week in the Byte. To unsubscribe, click here. View in browser.",
    });
    expect(r.intent).toBe("NEWSLETTER");
  });

  it("classifies a promotion", () => {
    const r = classifyIntent({
      fromEmail: "deals@storepromo.shop",
      fromName: "StorePromo",
      subject: "70% off everything ends tonight",
      snippet: "Last chance to grab 70% off. Shop now.",
      body: "70% off! Sale ends tonight. Free shipping. Shop now.",
    });
    expect(["PROMOTION", "NEWSLETTER"]).toContain(r.intent);
  });

  it("does not flag a sent email (from the user) as REQUIRES_REPLY", () => {
    const r = classifyIntent({
      fromEmail: "you@cirkle.mail",
      fromName: "You",
      subject: "Can we meet Thursday?",
      snippet: "Can we meet Thursday at 4?",
      body: "Can we meet Thursday at 4? Let me know.",
    });
    expect(r.intent).not.toBe("REQUIRES_REPLY");
  });

  it("detects commitment language", () => {
    const r = classifyIntent({
      fromEmail: "marcus@frostedlabs.io",
      fromName: "Marcus Lee",
      subject: "Launch checklist",
      snippet: "I'll freeze the build at midnight.",
      body: "I'll freeze the build at midnight. I plan to ship Thursday.",
    });
    expect(r.intent).toBe("COMMITMENT");
  });
});

describe("detectCommitments", () => {
  it("detects an outgoing commitment from the user", () => {
    const signals = detectCommitments(
      "<p>I will send the quotation tomorrow.</p>",
      "you@cirkle.mail"
    );
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(signals[0].direction).toBe("outgoing");
    expect(signals[0].evidence).toMatch(/will send/i);
  });

  it("detects an incoming commitment from a sender", () => {
    const signals = detectCommitments(
      "<p>We will deliver the goods by Friday.</p>",
      "supplier@acme.io"
    );
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(signals[0].direction).toBe("incoming");
  });

  it("detects a request (please send)", () => {
    const signals = detectCommitments(
      "<p>Please send the signed contract.</p>",
      "client@biz.com"
    );
    expect(signals.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for non-commitment text", () => {
    const signals = detectCommitments(
      "<p>Thanks for the update. Looks good.</p>",
      "a@b.com"
    );
    expect(signals).toEqual([]);
  });

  it("deduplicates by evidence", () => {
    const signals = detectCommitments(
      "<p>I will send it tomorrow. I will send it tomorrow.</p>",
      "you@cirkle.mail"
    );
    expect(signals.length).toBe(1);
  });
});

describe("sanitizeEmailHtml", () => {
  it("strips <script> tags", () => {
    const out = sanitizeEmailHtml("<p>hi</p><script>alert('xss')</script>");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert");
    expect(out).toContain("hi");
  });

  it("strips on* event handlers", () => {
    const out = sanitizeEmailHtml('<p onclick="evil()">hi</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("hi");
  });

  it("neutralizes javascript: URLs", () => {
    const out = sanitizeEmailHtml('<a href="javascript:evil()">click</a>');
    expect(out).not.toContain("javascript:evil");
  });

  it("preserves safe content", () => {
    const out = sanitizeEmailHtml("<p>Hello <b>world</b></p>");
    expect(out).toContain("Hello");
    expect(out).toContain("<b>world</b>");
  });

  it("preserves inline styles (used by seed data)", () => {
    const out = sanitizeEmailHtml('<table style="border-collapse:collapse">x</table>');
    expect(out).toContain("style");
    expect(out).toContain("border-collapse");
  });
});

describe("deriveCategory", () => {
  it("routes Newsletter label to PROMOTIONS", () => {
    expect(deriveCategory({ labels: "Newsletter" })).toBe("PROMOTIONS");
  });
  it("routes Social label to SOCIAL", () => {
    expect(deriveCategory({ labels: "Social" })).toBe("SOCIAL");
  });
  it("routes Finance label to UPDATES", () => {
    expect(deriveCategory({ labels: "Finance" })).toBe("UPDATES");
  });
  it("defaults to PRIMARY", () => {
    expect(deriveCategory({ labels: "Work" })).toBe("PRIMARY");
  });
});

describe("dateBucket", () => {
  it("buckets today as Today", () => {
    expect(dateBucket(new Date().toISOString())).toBe("Today");
  });
  it("buckets yesterday as Yesterday", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(dateBucket(d.toISOString())).toBe("Yesterday");
  });
});

describe("getInitials", () => {
  it("handles two names", () => {
    expect(getInitials("Priya Sharma")).toBe("PS");
  });
  it("handles one name", () => {
    expect(getInitials("Marcus")).toBe("M");
  });
});

describe("makeSnippet", () => {
  it("strips HTML + truncates", () => {
    const s = makeSnippet("<p>Hello <b>world</b> this is long</p>", 10);
    expect(s).not.toContain("<");
    expect(s.length).toBeLessThanOrEqual(11);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("textToHtml", () => {
  it("escapes HTML + converts newlines", () => {
    const h = textToHtml("<script>x</script>\nline2");
    expect(h).toContain("&lt;script&gt;");
    expect(h).toContain("<br/>");
    expect(h).not.toContain("<script>");
  });
});
