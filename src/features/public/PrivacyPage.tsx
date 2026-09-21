import { Link } from 'react-router-dom';
import { LegalPage, Section } from './LegalPage';

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" intro="This policy explains what information ShopOS handles, why, and the choices you have.">
      <Section title="1. Who we are">
        <p>ShopOS is developed and maintained by DMN Solutions. In this policy, "we" means DMN Solutions as the provider of ShopOS. Each business using ShopOS decides what information about its own customers, debtors and staff it records.</p>
      </Section>
      <Section title="2. Information ShopOS may process">
        <ul>
          <li><strong>Business information:</strong> business name, contact details, branches and settings.</li>
          <li><strong>Account and authentication information:</strong> name, email address, phone number, role, and your sign-in credentials. Passwords are stored only as secure hashes by our authentication provider. We cannot see them.</li>
          <li><strong>Staff information:</strong> names, roles and permissions of people the owner adds.</li>
          <li><strong>Customer information:</strong> names, phone numbers and purchase history that a business chooses to record.</li>
          <li><strong>Sales, inventory and debt records:</strong> products, stock levels and movements, sales, refunds, expenses, and amounts owed, including debtors who are not registered customers.</li>
          <li><strong>Payment information:</strong> the payment method recorded for a sale or payment (for example cash or M-Pesa) and amounts. ShopOS does not store card numbers or mobile-money PINs.</li>
          <li><strong>Device and application information:</strong> data needed to run the app, such as locally cached data for offline use and basic technical details.</li>
          <li><strong>Activity information:</strong> sign-ins, security events, an audit trail of important actions, and when a business was last active.</li>
          <li><strong>Reviews:</strong> if you submit a review on the website, the name you enter, your rating and your text are displayed publicly until removed.</li>
          <li><strong>Barcode lookups:</strong> when you scan a product barcode to add a product, the barcode number (not your business details) is sent to a public product database to fetch the product name and details.</li>
        </ul>
      </Section>
      <Section title="3. Why we use it">
        <p>To provide the service: authenticating users, running the till, keeping stock and debts accurate, synchronising data between devices, providing support, keeping the platform secure, preventing abuse, and reviewing new business applications. We do not sell personal information.</p>
      </Section>
      <Section title="4. M-Pesa payments and text messages">
        <p><strong>Website and web app:</strong> the ShopOS website and installable web app (PWA) cannot read text messages and do not. In these, M-Pesa payments are typed or pasted in by your team.</p>
        <p className="mt-2"><strong>ShopOS Android app (optional feature):</strong> if you turn on automatic M-Pesa detection, the app asks for the Android permission to <em>receive</em> SMS. When you grant it:</p>
        <ul className="mt-1">
          <li>ShopOS looks only at messages sent by M-Pesa that confirm a payment received. All other messages, including personal messages, are ignored: they are not read by ShopOS, shown, stored or uploaded.</li>
          <li>From a payment confirmation, ShopOS extracts only what it needs: the transaction code, amount, payer name and phone number (as shown in the message), and the time. These are saved to your business's records and synchronised, like any other payment record.</li>
          <li>The original text of a recognised payment message is kept on your device only, for your reference, and is not uploaded.</li>
          <li>ShopOS does not request permission to read your existing message history.</li>
          <li>You can turn the feature off in ShopOS, or remove the permission in Android Settings, at any time.</li>
        </ul>
        <p className="mt-2">This Android feature is only active in an Android build that has been approved to use this permission.</p>
      </Section>
      <Section title="5. How data is protected">
        <ul>
          <li>Data is sent over encrypted connections.</li>
          <li>Each business's data is separated at the database level, so one business cannot read another's.</li>
          <li>Staff access is limited by role and permission.</li>
          <li>Important actions are recorded in an audit trail.</li>
        </ul>
        <p className="mt-2">No system is perfectly secure, so please use strong passwords and keep devices locked.</p>
      </Section>
      <Section title="6. Who can access it">
        <p>Users of a business can see that business's data according to the permissions the owner gives them. ShopOS platform administrators can see business account details and status, and may see limited activity such as when a business was last active, to manage accounts and provide support. We may disclose information when required by law.</p>
      </Section>
      <Section title="7. Third-party services">
        <p>We use third-party providers to run ShopOS, including cloud database and authentication services, web hosting and a public product-information database for barcode lookups. They process data on our behalf to provide the service and are subject to their own security and privacy commitments.</p>
      </Section>
      <Section title="8. Data retention">
        <p>Business records are kept while the business account is active so the business can keep using them. Account data can be deleted or anonymised when an account is closed and you ask us to, except where some records may need to be kept for legal, security or dispute purposes. Data stored offline on a device remains there until it is synchronised or cleared on that device.</p>
      </Section>
      <Section title="9. Business owners' responsibilities">
        <p>Businesses that record personal information about customers, debtors or staff are responsible for having a lawful reason to do so, recording only what they need, keeping it accurate, and respecting requests from the people concerned.</p>
      </Section>
      <Section title="10. Your rights">
        <p>You may ask to see, correct or delete personal information we hold about you, or object to how it is used, subject to applicable law. If your information is held by a business (for example as a customer or debtor), please contact that business first.</p>
      </Section>
      <Section title="11. Changes to this policy">
        <p>We may update this policy. The date at the top shows the latest version. If a change materially affects how your data is handled, we will make that clear in the app or on this site.</p>
      </Section>
      <Section title="12. Contact us">
        <p>For privacy questions or requests, use our <Link to="/contact">Contact page</Link>.</p>
      </Section>
    </LegalPage>
  );
}
