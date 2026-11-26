import type { Product } from './posters';

export type Tone = 'friendly' | 'punchy' | 'offer' | 'swahili';
export const TONES: [Tone, string][] = [['friendly', 'Friendly'], ['punchy', 'Short & punchy'], ['offer', 'Call to act now'], ['swahili', 'Kiswahili']];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const some = <T,>(a: T[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);

const T: Record<Product, Record<Tone, { hook: string[]; body: string[]; bullets: string[]; cta: string[] }>> = {
  pos: {
    friendly: {
      hook: ['Running a shop is hard enough. 🛒', 'Still using a notebook for your shop? 📒', 'Imagine closing your shop knowing exactly what you made today. 💰'],
      body: ['ShopOS lets you sell, track stock and record debts, all from your phone.', 'With ShopOS you see your sales, stock and profit in one place, even when the internet is off.'],
      bullets: ['Sell and print receipts', 'Low-stock alerts', 'Debts and reminders', 'Daily sales reports', 'M-Pesa payments', 'Works offline'],
      cta: ['Tap the link below and sign in 👇', 'Try it today 👇', 'Get started in minutes 👇'],
    },
    punchy: {
      hook: ['Your shop. Your phone. Your control. 📱', 'Know your profit. Every day. 💰', 'Stop guessing. Start tracking. 📊'],
      body: ['Sales. Stock. Debts. One app.', 'Built for shops in Kenya.'],
      bullets: ['Works offline', 'M-Pesa ready', 'Daily reports', 'Receipts in seconds'],
      cta: ['Link below 👇', 'Try ShopOS 👇', 'Start now 👇'],
    },
    offer: {
      hook: ['Losing money to missing stock? 😬', 'Do you know exactly who owes you money? 🤔', 'Every unrecorded sale is lost profit. ⚠️'],
      body: ['Fix it today with ShopOS. Record every sale, watch your stock and chase debts without the headache.', 'ShopOS keeps your shop organised so you can focus on selling.'],
      bullets: ['Stock alerts before you run out', 'Debt reminders to customers', 'Profit reports every day'],
      cta: ['Don\'t wait. Tap the link and sign up now 👇', 'Start today, thank yourself tomorrow 👇'],
    },
    swahili: {
      hook: ['Biashara yako, simu yako! 📱', 'Jua faida yako kila siku! 💰', 'Bado unatumia daftari kwa duka lako? 📒'],
      body: ['ShopOS inakusaidia kurekodi mauzo, kusimamia stoo na madeni yako yote kwenye simu. Inafanya kazi hata bila intaneti.', 'Ukiwa na ShopOS, unaona mauzo, stoo na faida yako mahali pamoja.'],
      bullets: ['Risiti haraka', 'Arifa stoo ikipungua', 'Kumbusho za madeni', 'Ripoti za kila siku', 'Malipo ya M-Pesa'],
      cta: ['Bonyeza link hapa chini ujiunge leo 👇', 'Anza leo 👇'],
    },
  },
  booking: {
    friendly: {
      hook: ['Tired of answering "are you free?" all day? 📅', 'Wouldn\'t it be nice if customers booked themselves? ✨', 'Your appointment book, but online. 📲'],
      body: ['ShopOS Booking gives you your own booking link. Share it on WhatsApp and customers pick a time that works.', 'Customers book 24/7, you get reminders, and no more double bookings.'],
      bullets: ['Your own booking page', 'Automatic reminders', 'M-Pesa deposits', 'Manage staff and services', 'No double bookings'],
      cta: ['Get your booking link below 👇', 'Set up in minutes 👇'],
    },
    punchy: {
      hook: ['Get booked while you sleep. 😴', 'Fewer no-shows. More bookings. ✅', 'Book me online. 📅'],
      body: ['Your own booking link. Reminders. Deposits.', 'Made for salons, barbers, clinics and studios.'],
      bullets: ['Online booking page', 'Reminders', 'M-Pesa deposits'],
      cta: ['Link below 👇', 'Start now 👇'],
    },
    offer: {
      hook: ['No-shows costing you money? 💸', 'Missed calls = missed bookings. 📞', 'Customers want to book at night too. 🌙'],
      body: ['Take bookings and deposits online with ShopOS and fill your diary without lifting a phone.', 'Let customers book themselves while you focus on the work.'],
      bullets: ['Deposits cut no-shows', 'Reminders sent automatically', 'Share one link on WhatsApp'],
      cta: ['Tap the link and start taking bookings today 👇', 'Don\'t miss another booking 👇'],
    },
    swahili: {
      hook: ['Wateja wakuweke miadi mtandaoni, saa 24! 📅', 'Pata miadi hata ukiwa umelala! 😴', 'Acha kujibu "uko free?" kila wakati! 📲'],
      body: ['ShopOS Booking inakupa link yako ya kuweka miadi. Isambaze WhatsApp na wateja wachague muda unaowafaa.', 'Kumbusho za kiotomatiki na malipo ya amana kwa M-Pesa.'],
      bullets: ['Ukurasa wako wa miadi', 'Kumbusho kwa wateja', 'Amana kwa M-Pesa', 'Hakuna miadi mara mbili'],
      cta: ['Pata link yako hapa chini 👇', 'Anza leo 👇'],
    },
  },
};
const TAGS: Record<Product, string> = { pos: '#ShopOS #BiasharaKenya #SmallBusinessKenya #MPesa #POS', booking: '#ShopOS #BookingKenya #Salon #Barbershop #SmallBusinessKenya' };

/** Fresh captions each time: different hook, body, features and call to action. */
export function generateCaptions(product: Product, tone: Tone, link: string, hashtags: boolean, n = 5): string[] {
  const t = T[product][tone]; const seen = new Set<string>(); const out: string[] = [];
  for (let i = 0; i < n * 6 && out.length < n; i++) {
    const bullets = some(t.bullets, tone === 'punchy' ? 2 : 3).map((b) => `✅ ${b}`).join('\n');
    const text = [pick(t.hook), pick(t.body), bullets, `${pick(t.cta)} ${link}`, hashtags ? TAGS[product] : ''].filter(Boolean).join('\n\n');
    if (!seen.has(text)) { seen.add(text); out.push(text); }
  }
  return out;
}
