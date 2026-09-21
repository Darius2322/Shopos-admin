import { Mail, MessageCircle, Phone, ExternalLink } from 'lucide-react';
import { PublicLayout, PageHeading } from './PublicLayout';
import { usePlatformContact, DMN_URL } from './usePlatformContact';

export function ContactPage() {
  const c = usePlatformContact();
  const items = [
    c?.support_email && { icon: Mail, label: 'Email', value: c.support_email, href: `mailto:${c.support_email}` },
    c?.support_whatsapp && { icon: MessageCircle, label: 'WhatsApp', value: `+${c.support_whatsapp.replace(/^\+/, '')}`, href: `https://wa.me/${c.support_whatsapp.replace(/\D/g, '')}` },
    c?.support_phone && { icon: Phone, label: 'Phone', value: c.support_phone, href: `tel:${c.support_phone}` },
  ].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href: string }[];

  return (
    <PublicLayout title="Contact">
      <PageHeading title="Contact us" lead="Questions before signing up, or help with an existing account. Reach us using any of these." />
      <div className="max-w-3xl mx-auto px-5 pb-12 space-y-6">
        {items.length > 0 ? (
          <div className="grid sm:grid-cols-3 gap-4">
            {items.map(({ icon: Icon, label, value, href }) => (
              <a key={label} href={href} target={label === 'WhatsApp' ? '_blank' : undefined} rel="noreferrer"
                className="card p-4 flex sm:flex-col items-center sm:items-start gap-3 hover:border-field-600 transition-colors min-h-[72px]">
                <span className="w-10 h-10 rounded-xl bg-field-600 text-white flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
                <span className="min-w-0">
                  <span className="block text-xs text-slate-500">{label}</span>
                  <span className="block text-sm font-medium break-all">{value}</span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 card p-4">Support contact details are not available right now. You can reach the developer through the DMN Solutions website below.</p>
        )}
        <div className="card p-5 text-sm text-slate-600 leading-relaxed">
          <h2 className="font-medium text-ink mb-1">Already using ShopOS?</h2>
          Sign in and open <strong>Support</strong> from the menu to send a request with your account details attached. It gets you an answer faster than a general message.
        </div>
        <div className="card p-5 text-sm text-slate-600">
          <h2 className="font-medium text-ink mb-1">Custom systems and services</h2>
          <p className="mb-3">For setup help or a custom business system, get in touch with the developer.</p>
          <a href={DMN_URL} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-1.5 text-sm">DMN Solutions <ExternalLink className="w-4 h-4" aria-hidden="true" /></a>
        </div>
      </div>
    </PublicLayout>
  );
}
