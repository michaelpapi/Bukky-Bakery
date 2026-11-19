import { z } from 'astro/zod';

/* =====================================================================
   CLIENT SITE CONFIG: the contract between you, Claude Code and the core.
   Rules of the design:
   - Everything is an allowlist (enums). An agent cannot invent CSS, fonts or widgets.
   - No 3D runtime. "3D look" comes from pre-rendered cutouts + CSS depth/motion.
   - Page-weight budgets live in the validator, NOT here, so no client can loosen them.
   ===================================================================== */

export const WORLDS = ['pharmacy', 'jewellery', 'fashion', 'food', 'wholesale', 'school'] as const;
export const TYPOGRAPHY = ['system', 'friendly', 'playful', 'editorial', 'bold', 'classic'] as const;
export const SHAPES = ['none', 'blobs', 'waves', 'dots', 'stripes', 'sunburst'] as const;
export const MASKS = ['none', 'arch', 'blob', 'circle', 'pill', 'tilt-frame'] as const;
export const ICONS = ['leaf', 'truck', 'shield', 'clock', 'heart', 'star', 'book', 'users', 'map', 'phone', 'flask', 'cake', 'shirt', 'gem', 'bag'] as const;
export const SECTION_TYPES = [
  'hero', 'marquee', 'story', 'products', 'features', 'journey', 'programs',
  'gallery', 'testimonials', 'faq', 'booking', 'cta-band', 'contact',
] as const;

/* ---------- primitives ---------- */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use a 6-digit hex colour like #1a2b3c');
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, numbers and hyphens only');
// Only web-light formats may be referenced. jpg/png must be converted to webp/avif by the asset step.
const assetPath = z.string().regex(/^\/[A-Za-z0-9/_.-]+\.(webp|avif|svg)$/, 'asset must start with / and be .webp, .avif or .svg');
const httpsUrl = z.url().refine((u) => u.startsWith('https://'), 'must be an https:// URL');

export const mediaSchema = z
  .object({
    src: assetPath,
    alt: z.string().max(140).default(''),
    decorative: z.boolean().default(false),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    mask: z.enum(MASKS).default('none'),
  })
  .refine((m) => m.decorative || m.alt.trim().length >= 3, {
    message: 'alt text (3+ chars) is required unless the image is decorative',
    path: ['alt'],
  });

const ctaSchema = z
  .object({
    label: z.string().min(2).max(28),
    action: z.enum(['whatsapp', 'order', 'booking', 'schedule', 'call', 'link']), // schedule = calendar popup, sends the request to WhatsApp
    href: z.string().regex(/^(https:\/\/|\/|#)/).optional(),
  })
  .refine((c) => c.action !== 'link' || !!c.href, { message: 'action "link" needs an href', path: ['href'] });

/* ---------- hero cake pieces (they fall and stack in the intro) ---------- */
const pieceSchema = z.object({
  src: assetPath,
  name: slug,                                   // e.g. "tier-1"; used for tuning and for a11y-free decoration
  w: z.number().min(5).max(120),                // width as % of the cake stack (the widest piece is 100)
  overlap: z.number().min(-10).max(60).default(0), // % of stack width this piece sinks into the one below it
  depth: z.number().min(0).max(3).default(1),   // parallax depth when the cake leans (0 = stays, 3 = moves most)
  sprinkles: z.boolean().default(false),        // let the sprinkles land on this piece
});

// turntable frames: a src pattern with {nn} (01, 02 ...) and how many frames exist
const spinSchema = z.object({
  src: z.string().regex(/^\/[A-Za-z0-9/_.-]*\{nn\}[A-Za-z0-9/_.-]*\.(webp|avif)$/, 'spin src must start with / and contain {nn}, e.g. /images/spin/vanilla-{nn}.webp'),
  frames: z.number().int().min(8).max(36).default(16),
  reverse: z.boolean().default(false), // flip the drag direction if the turntable feels backwards
});

/* ---------- identity, brand, contact ---------- */
const businessSchema = z.object({
  name: z.string().min(2).max(50),
  tagline: z.string().min(5).max(100),
  description: z.string().min(40).max(160), // used for SEO + share previews
  city: z.string().min(2).max(40),
  state: z.string().max(40).optional(),
  country: z.string().length(2).default('NG'),
  foundedYear: z.number().int().min(1900).max(2100).optional(),
});

const paletteSchema = z.object({
  bg: hex, surface: hex, ink: hex, primary: hex, secondary: hex, accent: hex,
});

const brandSchema = z.object({
  logo: mediaSchema,
  favicon: assetPath.optional(),
  palette: paletteSchema,
  typography: z.enum(TYPOGRAPHY).default('friendly'),
  shapes: z.enum(SHAPES).default('blobs'),
  // tiny cut-out sprites (≤ 8 KB each) that the "floaters" ambient motion drifts around the page
  stickers: z.array(assetPath).max(6).default([]),
});

const contactSchema = z.object({
  whatsapp: z.string().regex(/^\d{10,15}$/, 'digits only, with country code, no + (e.g. 2348012345678)').optional(),
  phone: z.string().max(20).optional(),
  email: z.email().optional(),
  address: z.string().max(140).optional(),
  mapUrl: httpsUrl.optional(), // a link to Google Maps, never an embedded iframe (too heavy)
  hours: z.array(z.object({ days: z.string().max(30), time: z.string().max(30) })).max(7).default([]),
  social: z
    .object({
      instagram: httpsUrl.optional(), tiktok: httpsUrl.optional(),
      facebook: httpsUrl.optional(), x: httpsUrl.optional(), youtube: httpsUrl.optional(),
    })
    .prefault({}),
});

/* ---------- leads: where subscribers, orders and bookings are saved (a Google Sheet, through an Apps Script web app) ---------- */
const leadsSchema = z.object({
  url: z.string().regex(/^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.-]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/, 'must be the Apps Script web app URL, ending in /exec'),
  token: z.string().max(60).optional(), // optional shared word; must match TOKEN in the Apps Script (a speed bump against junk, not a secret)
  logOrders: z.boolean().default(true), // also save each order / date request, and let the script email the owner a PDF
});

/* ---------- checkout ---------- */
const checkoutSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('whatsapp'), messageTemplate: z.string().max(280).default('Hello {business}, I would like to order: {items}') }),
  z.object({ mode: z.literal('form'), formName: slug.default('orders') }), // Netlify Forms
  z.object({
    mode: z.literal('transfer'),
    bankName: z.string().min(2).max(40),
    accountName: z.string().min(2).max(60),
    accountNumber: z.string().regex(/^\d{10}$/, 'Nigerian account numbers (NUBAN) are 10 digits'),
  }),
  z.object({ mode: z.literal('payment-link'), provider: z.enum(['paystack', 'flutterwave', 'other']).default('paystack'), url: httpsUrl }),
  z.object({ mode: z.literal('contact-only') }),
]);

/* ---------- motion: names map to CSS-only presets in core ---------- */
export const motionSchema = z.object({
  intensity: z.enum(['calm', 'lively', 'loud']).default('lively'),
  pageTransition: z.enum(['none', 'fade', 'slide', 'wipe', 'iris']).default('fade'),
  hero: z.enum(['rise', 'mask-reveal', 'pop', 'split-words', 'parallax-layers']).default('rise'),
  reveal: z.enum(['none', 'fade-up', 'pop', 'wipe', 'stagger']).default('fade-up'),
  ambient: z.enum(['none', 'marquee-drift', 'floaters', 'gradient-shift']).default('none'),
  hover: z.enum(['none', 'lift', 'wiggle', 'tilt']).default('lift'),
  respectSaveData: z.boolean().default(true), // turn motion off when the phone's data saver is on
});

/* ---------- sections (a typed, ordered page) ---------- */
const sectionBase = z.object({
  id: slug.optional(),
  enabled: z.boolean().default(true),
  heading: z.string().max(70).optional(),
  tone: z.enum(['default', 'surface', 'primary', 'secondary', 'accent']).default('default'),
  reveal: motionSchema.shape.reveal.optional(), // per-section override
});

const textItem = z.object({ title: z.string().min(2).max(40), text: z.string().min(5).max(200) });

export const sectionSchema = z.discriminatedUnion('type', [
  sectionBase.extend({
    type: z.literal('hero'),
    headline: z.string().min(3).max(80),
    subheadline: z.string().max(160).optional(),
    layout: z.enum(['split', 'centered', 'stacked']).default('split'),
    media: mediaSchema.optional(),
    pieces: z.array(pieceSchema).max(8).default([]), // listed bottom to top; when present they replace `media` and play the drop-in intro
    cta: ctaSchema,
    secondaryCta: ctaSchema.optional(),
    badges: z.array(z.string().max(32)).max(4).default([]), // only claims the client can prove (e.g. a real registration)
  }),
  sectionBase.extend({ type: z.literal('marquee'), items: z.array(z.string().min(2).max(40)).min(3).max(12) }),
  sectionBase.extend({
    type: z.literal('story'),
    eyebrow: z.string().max(30).optional(),
    headline: z.string().min(3).max(90),
    paragraphs: z.array(z.string().min(10).max(400)).min(1).max(4),
    media: mediaSchema.optional(),
    highlights: z.array(z.object({ value: z.string().max(12), label: z.string().max(30) })).max(3).default([]),
  }),
  sectionBase.extend({
    type: z.literal('products'),
    layout: z.enum(['grid', 'menu', 'bulk', 'list']).default('grid'),
    filterByCategory: z.boolean().default(false),
    showPrices: z.boolean().default(true),
    limit: z.number().int().positive().max(60).optional(),
  }),
  sectionBase.extend({
    type: z.literal('features'),
    items: z.array(textItem.extend({ icon: z.enum(ICONS).optional() })).min(2).max(6),
  }),
  sectionBase.extend({
    type: z.literal('journey'),
    kind: z.enum(['steps', 'timeline']).default('steps'),
    items: z.array(textItem.extend({ label: z.string().max(16).optional() })).min(2).max(7),
  }),
  sectionBase.extend({
    type: z.literal('programs'),
    items: z
      .array(z.object({
        name: z.string().min(2).max(40), ages: z.string().max(30), summary: z.string().min(10).max(220),
        highlights: z.array(z.string().max(50)).max(4).default([]), media: mediaSchema.optional(),
      }))
      .min(1).max(8),
  }),
  sectionBase.extend({
    type: z.literal('gallery'),
    layout: z.enum(['strip', 'masonry', 'grid']).default('strip'),
    images: z.array(mediaSchema).min(3).max(8),
  }),
  sectionBase.extend({
    type: z.literal('testimonials'), // real quotes only, never invented
    items: z.array(z.object({ quote: z.string().min(10).max(240), name: z.string().min(2).max(40), role: z.string().max(40).optional() })).min(1).max(4),
  }),
  sectionBase.extend({
    type: z.literal('faq'),
    items: z.array(z.object({ q: z.string().min(5).max(100), a: z.string().min(5).max(300) })).min(2).max(8),
  }),
  sectionBase.extend({
    type: z.literal('booking'),
    kind: z.enum(['consultation', 'visit', 'order', 'enquiry']).default('consultation'),
    fields: z.array(z.enum(['parentName', 'childName', 'childAge', 'class', 'name', 'phone', 'email', 'date', 'message'])).min(2).max(8),
    formName: slug.default('booking'), // Netlify Forms
    successMessage: z.string().max(140).default('Thank you. We will reach out shortly.'),
  }),
  sectionBase.extend({ type: z.literal('cta-band'), headline: z.string().min(3).max(90), button: ctaSchema }),
  sectionBase.extend({
    type: z.literal('subscribe'),
    intro: z.string().max(160).optional(),
    button: z.string().min(2).max(28).default('Subscribe'),
    consentText: z.string().min(10).max(160).default('I agree that {business} may contact me with news and offers.'),
    successMessage: z.string().max(140).default('You are in! Thank you for subscribing.'),
    followHeading: z.string().max(40).default('Follow us'), // the links come from contact.social
  }),
  sectionBase.extend({ type: z.literal('contact'), showMapLink: z.boolean().default(true) }),
]);

/* ---------- microcopy that must not be hard-coded in components ---------- */
const labelsSchema = z
  .object({
    order: z.string().max(28).default('Order on WhatsApp'),
    enquire: z.string().max(20).default('Enquire'),
    call: z.string().max(20).default('Call us'),
    book: z.string().max(28).default('Book a visit'),
    orderItem: z.string().max(16).default('Order'), // short button on a product card
    add: z.string().max(16).default('Add'),
    added: z.string().max(16).default('Added'),
    all: z.string().max(16).default('All'),
    cart: z.string().max(24).default('Your order'),
    viewOrder: z.string().max(20).default('View order'),
    sendOrder: z.string().max(32).default('Send order on WhatsApp'),
    emptyCart: z.string().max(60).default('Nothing here yet. Add something from the menu.'),
    schedule: z.string().max(24).default('Pick a date'),
    sendRequest: z.string().max(32).default('Send request on WhatsApp'),
  })
  .prefault({});

/* ---------- the "pick a date" calendar popup (sends a booking request to WhatsApp) ---------- */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const schedulerSchema = z.object({
  title: z.string().max(40).default('Pick your date'),
  note: z.string().max(120).optional(),                       // shown under the calendar, e.g. the notice a custom cake needs
  leadDays: z.number().int().min(0).max(60).default(3),       // earliest bookable day = today + leadDays
  maxDays: z.number().int().min(14).max(365).default(120),    // how far ahead people can book
  closedWeekdays: z.array(z.number().int().min(0).max(6)).max(6).default([]), // 0 = Sunday
  blockedDates: z.array(isoDate).max(60).default([]),
  occasions: z.array(z.string().min(2).max(24)).min(2).max(8).default(['Birthday', 'Wedding', 'Naming ceremony', 'Corporate event', 'Other']),
  fulfilment: z.array(z.enum(['pickup', 'delivery'])).min(1).max(2).default(['pickup', 'delivery']),
});

/* ---------- contrast (WCAG) ---------- */
function lum(h: string) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- the resolved client config ---------- */
export const clientSchema = z
  .object({
    schemaVersion: z.literal(1),
    slug,
    world: z.enum(WORLDS),
    business: businessSchema,
    brand: brandSchema,
    locale: z.string().default('en-NG'),
    currency: z.string().length(3).default('NGN'), // formatted with Intl, never a hard-coded symbol
    contact: contactSchema,
    checkout: checkoutSchema,
    motion: motionSchema.prefault({}),
    labels: labelsSchema,
    scheduler: schedulerSchema.prefault({}),
    leads: leadsSchema.optional(),
    sections: z.array(sectionSchema).min(3).max(14),
    seo: z.object({ ogImage: assetPath.optional(), siteUrl: httpsUrl.optional() }).prefault({}),
  })
  .superRefine((c, ctx) => {
    const add = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
    const { bg, surface, ink, primary } = c.brand.palette;
    if (contrast(ink, bg) < 4.5) add(`ink on bg contrast is ${contrast(ink, bg).toFixed(2)}, needs 4.5+`, ['brand', 'palette', 'ink']);
    if (contrast(ink, surface) < 4.5) add(`ink on surface contrast is ${contrast(ink, surface).toFixed(2)}, needs 4.5+`, ['brand', 'palette', 'surface']);
    if (contrast(primary, bg) < 3) add(`primary on bg contrast is ${contrast(primary, bg).toFixed(2)}, needs 3+ for buttons`, ['brand', 'palette', 'primary']);

    const heroes = c.sections.filter((s) => s.type === 'hero').length;
    if (heroes !== 1) add(`exactly one hero section is required (found ${heroes})`, ['sections']);
    if (c.sections[0]?.type !== 'hero') add('hero must be the first section', ['sections', 0]);

    if (c.checkout.mode === 'whatsapp' && !c.contact.whatsapp) add('checkout mode "whatsapp" needs contact.whatsapp', ['contact', 'whatsapp']);

    const ctas: { cta: z.infer<typeof ctaSchema>; path: (string | number)[] }[] = [];
    c.sections.forEach((s, i) => {
      if (s.type === 'hero') { ctas.push({ cta: s.cta, path: ['sections', i, 'cta'] }); if (s.secondaryCta) ctas.push({ cta: s.secondaryCta, path: ['sections', i, 'secondaryCta'] }); }
      if (s.type === 'cta-band') ctas.push({ cta: s.button, path: ['sections', i, 'button'] });
    });
    const hasBooking = c.sections.some((s) => s.type === 'booking');
    for (const { cta, path } of ctas) {
      if (cta.action === 'whatsapp' && !c.contact.whatsapp) add('cta uses whatsapp but contact.whatsapp is missing', path);
      if (cta.action === 'schedule' && !c.contact.whatsapp) add('cta uses schedule but contact.whatsapp is missing (requests are sent to WhatsApp)', path);
      if (cta.action === 'call' && !c.contact.phone) add('cta uses call but contact.phone is missing', path);
      if (cta.action === 'booking' && !hasBooking) add('cta points to booking but there is no booking section', path);
    }
  });

export type ClientConfig = z.infer<typeof clientSchema>;

/* ---------- products.json (shops, menus, pharmacies, wholesalers) ---------- */
export const productSchema = z
  .object({
    id: slug,
    name: z.string().min(2).max(60),
    category: z.string().max(30).optional(),
    blurb: z.string().min(5).max(140),
    price: z.number().int().nonnegative().optional(), // whole naira
    priceOnRequest: z.boolean().default(false),
    priceNote: z.string().max(24).optional(), // e.g. "per 50kg bag"
    unit: z.string().max(20).optional(),
    moq: z.number().int().positive().optional(), // wholesale minimum order quantity
    image: mediaSchema,
    badge: z.enum(['new', 'popular', 'sale', 'limited', 'sold-out']).optional(),
    tint: z.enum(['primary', 'secondary', 'accent', 'surface']).optional(), // colour of the tile behind the cut-out
    available: z.boolean().default(true),
    rxOnly: z.boolean().default(false), // pharmacy: prescription-only, shown without price or order button
    options: z.array(z.object({ label: z.string().max(20), values: z.array(z.string().max(20)).min(1).max(8) })).max(3).default([]),
    details: z.object({
      description: z.string().min(10).max(400),
      includes: z.array(z.string().min(2).max(70)).max(6).default([]),
      leadTime: z.string().max(60).optional(),    // e.g. "Order 3 days ahead"
    }).optional(),
    spin: spinSchema.optional(),                  // turntable shown in the product popup
    payLink: httpsUrl.optional(),
    featured: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    const add = (message: string, path: string[]) => ctx.addIssue({ code: 'custom', message, path });
    if (p.rxOnly && (p.price !== undefined || p.payLink)) add('rxOnly products must not have a price or payLink', ['rxOnly']);
    if (!p.rxOnly && p.price === undefined && !p.priceOnRequest) add('set a price, or priceOnRequest: true', ['price']);
  });

export const productsSchema = z
  .array(productSchema)
  .min(1)
  .max(60)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((p, i) => {
      if (seen.has(p.id)) ctx.addIssue({ code: 'custom', message: `duplicate product id "${p.id}"`, path: [i, 'id'] });
      seen.add(p.id);
    });
  });
  