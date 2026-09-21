import { useLocation } from 'react-router-dom';
import { AboutPage } from './AboutPage';
import { ServicesPage } from './ServicesPage';
import { ContactPage } from './ContactPage';
import { ReviewsPage } from './ReviewsPage';
import { TermsPage } from './TermsPage';
import { PrivacyPage } from './PrivacyPage';
import { LegalHub } from './LegalHub';

/** Public marketing/legal pages. Rendered for everyone (signed in or not) so a
 * Privacy Policy URL always opens for a stranger, e.g. a Play Store reviewer. */
export default function PublicPages() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';
  switch (path) {
    case '/about': return <AboutPage />;
    case '/services': return <ServicesPage />;
    case '/contact': return <ContactPage />;
    case '/reviews': return <ReviewsPage />;
    case '/terms': return <TermsPage />;
    case '/privacy': return <PrivacyPage />;
    case '/legal': return <LegalHub />;
    default: return null;
  }
}
