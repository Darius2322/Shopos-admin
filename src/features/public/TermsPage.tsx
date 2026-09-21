import { Link } from 'react-router-dom';
import { LegalPage, Section } from './LegalPage';
import { DMN_URL } from './usePlatformContact';

export function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" intro="These terms govern your use of ShopOS. Please read them before registering a business.">
      <Section title="1. Use of ShopOS">
        <p>ShopOS is a point-of-sale and business management application developed and maintained by DMN Solutions. By registering, signing in or using ShopOS you agree to these terms. If you use ShopOS on behalf of a business, you confirm you are authorised to accept them for that business.</p>
      </Section>
      <Section title="2. Business accounts">
        <p>New businesses apply for an account and are reviewed before approval. Information you provide must be accurate. Each business is a separate workspace: its products, sales, customers, debts, staff and settings are private to that business. The business owner is responsible for everything done under the business's accounts.</p>
      </Section>
      <Section title="3. Account security">
        <ul>
          <li>Keep your password and activation codes private and do not share accounts between people.</li>
          <li>The owner decides which staff can access the business and what each of them can do, and should remove access for people who leave.</li>
          <li>Tell us promptly if you believe an account has been accessed without permission.</li>
        </ul>
      </Section>
      <Section title="4. Subscriptions and plans">
        <p>Some features or account periods may depend on a plan or an activation period agreed with the business. Where a plan or period applies, access can change or end when it expires. Plan details are agreed directly with you and are not set out in these terms.</p>
      </Section>
      <Section title="5. Data responsibility">
        <p>You own the business data you enter. You are responsible for its accuracy and for having the right to record any personal information about your customers, debtors and staff. You are responsible for complying with the laws that apply to your business, including tax and data protection rules. See our <Link to="/privacy">Privacy Policy</Link> for how we handle data.</p>
      </Section>
      <Section title="6. Transaction records">
        <p>ShopOS records what you and your staff enter or process, such as sales, refunds, stock changes and debts, and keeps an audit trail of important actions. These records are a tool to help you run your business. You remain responsible for your own accounting, tax and legal record-keeping.</p>
      </Section>
      <Section title="7. Offline functionality">
        <p>ShopOS can keep working without an internet connection by saving data on your device and sending it when the connection returns. Until data has synchronised, it exists only on that device. Clearing browser or app data, or losing or resetting the device before synchronisation, can permanently lose unsynchronised records. Check the sync status shown in the app.</p>
      </Section>
      <Section title="8. Third-party services">
        <p>ShopOS relies on third-party providers to operate, including cloud database, authentication and hosting services. Their availability and terms are outside our control. Your use of connected services such as printers, browsers and mobile networks is subject to their own terms.</p>
      </Section>
      <Section title="9. M-Pesa and payment information">
        <p>ShopOS lets staff record the payment method used for a sale or debt payment, including M-Pesa. ShopOS does not process payments, hold funds or act as a payment provider, and it does not use the M-Pesa app. In the ShopOS Android app, if you choose to turn on automatic detection and grant the permission, ShopOS reads only M-Pesa payment confirmation messages, as described in the Privacy Policy. Automatic detection may miss or misread a message, so confirming that a mobile-money payment was actually received is always your responsibility.</p>
      </Section>
      <Section title="10. Acceptable use">
        <ul>
          <li>Do not use ShopOS for unlawful activity, fraud or to record transactions you know to be false.</li>
          <li>Do not attempt to access another business's data, or to disrupt, probe or bypass the security of the service.</li>
          <li>Do not copy, resell or reverse-engineer ShopOS except as the law allows.</li>
        </ul>
      </Section>
      <Section title="11. Intellectual property">
        <p>ShopOS, its design and its software belong to DMN Solutions or its licensors. You receive a limited, non-exclusive right to use it for your business while your account is active. Your business data stays yours.</p>
      </Section>
      <Section title="12. Service availability">
        <p>We work to keep ShopOS available and reliable, but we do not promise uninterrupted or error-free service. There may be maintenance, outages, or interruptions caused by providers or networks. Features may change over time.</p>
      </Section>
      <Section title="13. Suspension and termination">
        <p>We may pause, suspend or close an account if these terms are breached, if the account poses a security risk, if an activation or plan period ends, or where required by law. You may stop using ShopOS at any time and can ask us to close your account. We will try to give notice where it is reasonable to do so.</p>
      </Section>
      <Section title="14. Limitation of liability">
        <p>ShopOS is provided as it is. To the extent the law allows, DMN Solutions is not liable for indirect or consequential losses, lost profits or lost data arising from your use of ShopOS, including losses from unsynchronised offline data, incorrect entries by users, or third-party service failures. Nothing in these terms limits liability that cannot be limited by law.</p>
      </Section>
      <Section title="15. Updates to these terms">
        <p>We may update these terms from time to time. The date at the top shows when they were last changed. Continuing to use ShopOS after an update means you accept the updated terms.</p>
      </Section>
      <Section title="16. Contact">
        <p>Questions about these terms? Use our <Link to="/contact">Contact page</Link>. ShopOS is developed and maintained by <a href={DMN_URL} target="_blank" rel="noreferrer">DMN Solutions</a>.</p>
      </Section>
    </LegalPage>
  );
}
