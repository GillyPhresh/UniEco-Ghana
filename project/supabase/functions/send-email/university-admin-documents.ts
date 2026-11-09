import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const BRAND_ORIGIN = "https://www.uniecoghana.com";
const LOGO_URL = `${BRAND_ORIGIN}/official-letterhead/assets/unieco-official-logo.png`;
const FONT_URL = `${BRAND_ORIGIN}/official-letterhead/assets/Montserrat-Variable.ttf`;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 48;
const RIGHT = PAGE_WIDTH - 48;
const GREEN = rgb(0.02, 0.35, 0.24);
const MUTED = rgb(0.36, 0.41, 0.46);
const INK = rgb(0.10, 0.14, 0.18);

type Duty = { title?: unknown; description?: unknown };
type AppointmentMetadata = Record<string, unknown> & {
  name?: unknown;
  university_name?: unknown;
  appointment_title?: unknown;
  document_reference?: unknown;
  effective_date?: unknown;
  letter_body?: unknown;
  duties?: unknown;
};

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType: "application/pdf";
};

let assetsPromise: Promise<{ logo: Uint8Array; font: Uint8Array }> | null = null;

async function loadBrandAssets() {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      const [logoResponse, fontResponse] = await Promise.all([
        fetch(LOGO_URL, { redirect: "error" }),
        fetch(FONT_URL, { redirect: "error" }),
      ]);
      if (!logoResponse.ok || !fontResponse.ok) {
        throw new Error("Official UniEco Ghana letterhead assets are unavailable.");
      }
      const [logoBuffer, fontBuffer] = await Promise.all([
        logoResponse.arrayBuffer(),
        fontResponse.arrayBuffer(),
      ]);
      if (logoBuffer.byteLength > 2_000_000 || fontBuffer.byteLength > 2_000_000) {
        throw new Error("Official letterhead asset exceeded the allowed size.");
      }
      return { logo: new Uint8Array(logoBuffer), font: new Uint8Array(fontBuffer) };
    })().catch((error) => {
      assetsPromise = null;
      throw error;
    });
  }
  return await assetsPromise;
}

function decodeSignature() {
  const count = Number(Deno.env.get("UNIECO_MD_SIGNATURE_PART_COUNT"));
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error("The Managing Director signature is not configured for official appointment letters.");
  }
  const pieces: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const key = `UNIECO_MD_SIGNATURE_PART_${String(index).padStart(2, "0")}`;
    const piece = Deno.env.get(key);
    if (!piece || piece.length > 20_000 || !/^[A-Za-z0-9+/=]+$/.test(piece)) {
      throw new Error("The Managing Director signature configuration is incomplete.");
    }
    pieces.push(piece);
  }
  const encoded = pieces.join("");
  if (!encoded || encoded.length > 1_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("The Managing Director signature is not configured for official appointment letters.");
  }
  const binary = atob(encoded);
  if (binary.length > 1_500_000) throw new Error("The signature image exceeds the allowed size.");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function clean(value: unknown, fallback = "", limit = 5000) {
  return String(value ?? fallback).replaceAll("\u0000", "").trim().slice(0, limit);
}

function formatDate(value: unknown) {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
}

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) { lines.push(""); continue; }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function addLetterhead(page: ReturnType<PDFDocument["addPage"]>, logo: Awaited<ReturnType<PDFDocument["embedPng"]>>, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, date: string, reference: string) {
  const logoScale = Math.min(60 / logo.width, 60 / logo.height);
  const logoWidth = logo.width * logoScale;
  const logoHeight = logo.height * logoScale;
  page.drawImage(logo, { x: LEFT, y: PAGE_HEIGHT - 82, width: logoWidth, height: logoHeight });

  const brandX = LEFT + 76;
  page.drawText("UNIECO GHANA", { x: brandX, y: PAGE_HEIGHT - 43, size: 17, font, color: GREEN });
  page.drawText("CAMPUS COMMERCE AND COMMUNITY PLATFORM", { x: brandX, y: PAGE_HEIGHT - 59, size: 6.5, font, color: MUTED });
  page.drawText("0249902919  |  info.uniecoghana@gmail.com", { x: brandX, y: PAGE_HEIGHT - 73, size: 7.2, font, color: MUTED });
  page.drawText("www.uniecoghana.com", { x: brandX, y: PAGE_HEIGHT - 86, size: 7.2, font, color: GREEN });

  const stripeY = PAGE_HEIGHT - 105;
  page.drawRectangle({ x: LEFT, y: stripeY, width: 22, height: 2.4, color: rgb(0.78, 0.08, 0.16) });
  page.drawRectangle({ x: LEFT + 22, y: stripeY, width: 22, height: 2.4, color: rgb(0.98, 0.72, 0.08) });
  page.drawRectangle({ x: LEFT + 44, y: stripeY, width: 22, height: 2.4, color: rgb(0.02, 0.40, 0.25) });

  page.drawText(`Date: ${date}`, { x: LEFT, y: PAGE_HEIGHT - 137, size: 8.5, font, color: INK });
  page.drawText(`Our Ref: ${reference}`, { x: LEFT, y: PAGE_HEIGHT - 153, size: 8.5, font, color: INK });
  const official = "OFFICIAL COMMUNICATION";
  const officialWidth = font.widthOfTextAtSize(official, 9);
  page.drawText(official, { x: RIGHT - officialWidth, y: PAGE_HEIGHT - 146, size: 9, font, color: GREEN });
  page.drawLine({ start: { x: LEFT, y: PAGE_HEIGHT - 174 }, end: { x: RIGHT, y: PAGE_HEIGHT - 174 }, thickness: 0.7, color: rgb(0.86, 0.89, 0.91) });
}

function textLines(page: ReturnType<PDFDocument["addPage"]>, text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, y: number, opts: { size?: number; color?: ReturnType<typeof rgb>; indent?: number; lineHeight?: number; bottom?: number; newPage: () => void; getPage: () => ReturnType<PDFDocument["addPage"]> }) {
  const size = opts.size ?? 9.4;
  const lineHeight = opts.lineHeight ?? size * 1.65;
  const x = LEFT + (opts.indent ?? 0);
  let currentPage = page;
  let currentY = y;
  const lines = wrapText(text, font, size, RIGHT - x);
  for (const line of lines) {
    if (currentY < (opts.bottom ?? 90)) {
      opts.newPage();
      currentPage = opts.getPage();
      currentY = PAGE_HEIGHT - 205;
    }
    if (line) currentPage.drawText(line, { x, y: currentY, size, font, color: opts.color ?? INK });
    currentY -= lineHeight;
  }
  return { page: currentPage, y: currentY };
}

function signatureBytes() {
  return decodeSignature();
}

export async function createUniversityAdminAppointmentAttachments(meta: AppointmentMetadata): Promise<EmailAttachment[]> {
  const name = clean(meta.name, "University Administrator", 160);
  const university = clean(meta.university_name, "assigned university", 200);
  const title = clean(meta.appointment_title, "University Administrator", 160);
  const reference = clean(meta.document_reference, "", 100).replace(/[^A-Za-z0-9_-]/g, "-");
  const date = formatDate(meta.effective_date);
  const body = clean(meta.letter_body, "", 12000);
  const duties = Array.isArray(meta.duties) ? (meta.duties as Duty[]).slice(0, 24) : [];
  if (!reference || !body) throw new Error("The approved appointment is missing its official letter reference or content.");

  const [{ logo: logoBytes, font: fontBytes }, signature] = await Promise.all([loadBrandAssets(), Promise.resolve(signatureBytes())]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`UniEco Ghana — ${title} — ${name}`);
  pdf.setAuthor("UniEco Ghana");
  pdf.setSubject(`Official appointment for ${university}`);
  pdf.setCreator("UniEco Ghana Management");
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const logo = await pdf.embedPng(logoBytes);
  const signatureImage = await pdf.embedPng(signature);
  const pages: ReturnType<typeof pdf.addPage>[] = [];
  const newPage = () => {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    addLetterhead(page, logo, font, date, reference);
  };
  newPage();

  let page = pages[0];
  let y = PAGE_HEIGHT - 207;
  const advance = (result: { page: ReturnType<typeof pdf.addPage>; y: number }) => { page = result.page; y = result.y; };
  const paragraph = (text: string, size = 9.4, gap = 7) => {
    advance(textLines(page, text, font, y, { size, lineHeight: size * 1.6, newPage, getPage: () => pages[pages.length - 1] }));
    y -= gap;
  };

  page.drawText(`To: ${name}`, { x: LEFT, y, size: 9.2, font, color: INK }); y -= 14;
  page.drawText(`University: ${university}`, { x: LEFT, y, size: 9.2, font, color: INK }); y -= 23;
  page.drawText(`SUBJECT: ${title}`, { x: LEFT, y, size: 10, font, color: GREEN }); y -= 24;

  const bodyWithoutTypedSignature = body.replace(/\n\s*Yours faithfully,[\s\S]*$/i, "").trim();
  for (const section of bodyWithoutTypedSignature.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean)) paragraph(section);

  if (y < 190) { newPage(); page = pages[pages.length - 1]; y = PAGE_HEIGHT - 205; }
  paragraph("Yours faithfully,", 9.2, 0);
  const sigScale = Math.min(104 / signatureImage.width, 42 / signatureImage.height);
  const sigWidth = signatureImage.width * sigScale;
  const sigHeight = signatureImage.height * sigScale;
  if (y - sigHeight < 105) { newPage(); page = pages[pages.length - 1]; y = PAGE_HEIGHT - 205; }
  page.drawImage(signatureImage, { x: LEFT, y: y - sigHeight + 7, width: sigWidth, height: sigHeight });
  y -= sigHeight + 9;
  page.drawText("Gilbert Asare Marfo", { x: LEFT, y, size: 9.5, font, color: INK }); y -= 14;
  page.drawText("Managing Director", { x: LEFT, y, size: 8.5, font, color: GREEN }); y -= 13;
  page.drawText("UniEco Ghana", { x: LEFT, y, size: 8.5, font, color: MUTED });

  for (const letterPage of pages) addFooter(letterPage, font);
  const signedAppointmentBytes = await pdf.save();

  const dutiesPdf = await PDFDocument.create();
  dutiesPdf.registerFontkit(fontkit);
  dutiesPdf.setTitle(`UniEco Ghana — Administrator Duties and Code of Conduct — ${university}`);
  dutiesPdf.setAuthor("UniEco Ghana");
  dutiesPdf.setSubject("University Administrator duties, performance rules, and conduct");
  const dutiesFont = await dutiesPdf.embedFont(fontBytes, { subset: true });
  const dutiesLogo = await dutiesPdf.embedPng(logoBytes);
  const dutiesPages: ReturnType<typeof dutiesPdf.addPage>[] = [];
  const addDutiesPage = () => {
    const next = dutiesPdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    dutiesPages.push(next);
    addLetterhead(next, dutiesLogo, dutiesFont, date, reference);
  };
  addDutiesPage();
  let dutiesPage = dutiesPages[0];
  let dutiesY = PAGE_HEIGHT - 207;
  dutiesPage.drawText("DUTIES, PERFORMANCE RULES AND CODE OF CONDUCT", { x: LEFT, y: dutiesY, size: 10.2, font: dutiesFont, color: GREEN });
  dutiesY -= 25;
  const dutyText = (value: string, size = 9.2, indent = 0) => {
    const out = textLines(dutiesPage, value, dutiesFont, dutiesY, { size, indent, lineHeight: size * 1.55, newPage: addDutiesPage, getPage: () => dutiesPages[dutiesPages.length - 1] });
    dutiesPage = out.page;
    dutiesY = out.y - 7;
  };
  dutyText(`Appointment: ${title} · ${university}`, 9.3);
  dutyText("Role and duties", 9.7);
  const defaultDuties = [
    { title: "Student and vendor outreach", description: "Introduce UniEco Ghana to students and vendors in the assigned university community using approved materials." },
    { title: "Registration support", description: "Guide applicants through the official registration steps and help them use the administrator referral link." },
    { title: "Accurate information", description: "Share current, approved information and report incorrect university, business, or platform details." },
    { title: "Community support", description: "Direct payment, account, verification, safety, and technical issues to official UniEco Ghana support." },
    { title: "Weekly earnings and reporting", description: "Review the administrator dashboard and weekly payout history; promptly raise concerns about missing or incorrect referral attribution." },
  ];
  const dutyItems = duties.length ? duties : defaultDuties;
  for (const item of dutyItems) {
    const label = clean(item.title, "Assigned duty", 180);
    const detail = clean(item.description, "Follow the instructions in your administrator workspace.", 1200);
    dutyText(`• ${label}`, 9.2, 8);
    dutyText(detail, 8.7, 19);
  }
  dutyText("How performance is counted", 9.7);
  dutyText("A referral is counted only after the platform records the required completed registration and verification conditions. Link clicks, duplicate accounts, self-referrals, unpaid accounts, and incomplete or unverified registrations do not count. Student and vendor totals are shown separately in the administrator dashboard.", 8.9);
  dutyText("Rules and safeguards", 9.7);
  const rules = [
    "Never ask for passwords, one-time codes, mobile money PINs, card details, or payment PINs.",
    "Never collect unofficial registration or verification fees. All payments must use the official UniEco Ghana Paystack checkout.",
    "Do not create accounts for other people, submit false information, promise a job or payment amount, or manipulate referral counts.",
    "Use personal data only for the assigned work. Do not download, publish, or share applicants’ private documents or contact details.",
    "Do not spam, impersonate UniEco Ghana, make unapproved public statements, or use the administrator token outside its intended campus outreach.",
    "Report suspected fraud, account compromise, harassment, payment discrepancies, or data exposure to the Super Admin promptly.",
    "Compensation is GH₵2 for each qualified student or vendor registration. A dual student-vendor account counts once. Weekly earnings follow a seven-day review period and the shared weekly payout rules, including the minimum balance; displayed estimates are not a guarantee of payment.",
    "Administrator access is personal, limited to the assigned university, and may be suspended or withdrawn for misconduct or security reasons.",
  ];
  for (const rule of rules) dutyText(`• ${rule}`, 8.7, 8);
  dutyText("Acknowledgement", 9.7);
  dutyText("By accepting the appointment and using administrator access, you agree to follow these duties, safeguards, and the UniEco Ghana platform rules. If anything is unclear, ask the Super Admin before acting.", 8.9);

  for (const dutiesPage of dutiesPages) addFooter(dutiesPage, dutiesFont);
  const dutiesBytes = await dutiesPdf.save();
  return [
    { filename: `UniEco-Ghana-Appointment-${reference}.pdf`, content: bytesToBase64(signedAppointmentBytes), contentType: "application/pdf" },
    { filename: `UniEco-Ghana-Administrator-Duties-${reference}.pdf`, content: bytesToBase64(dutiesBytes), contentType: "application/pdf" },
  ];
}

function addFooter(page: ReturnType<PDFDocument["addPage"]>, font: Awaited<ReturnType<PDFDocument["embedFont"]>>) {
  page.drawLine({ start: { x: LEFT, y: 56 }, end: { x: RIGHT, y: 56 }, thickness: 0.6, color: rgb(0.86, 0.89, 0.91) });
  const footer = "UniEco Ghana  |  0249902919  |  info.uniecoghana@gmail.com  |  www.uniecoghana.com";
  const size = 6.5;
  const width = font.widthOfTextAtSize(footer, size);
  page.drawText(footer, { x: (PAGE_WIDTH - width) / 2, y: 39, size, font, color: MUTED });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
