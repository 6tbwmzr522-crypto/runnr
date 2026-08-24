# Privacy Policy

**Runnr — Thin Ice Digital Ltd**
Last updated: August 2026

---

## 1. Who We Are

Runnr is operated by **Thin Ice Digital Ltd**, registered in England and Wales. We are the data controller for personal data collected through runnr.fyi.

**Contact:** info@thinicedigital.com

---

## 2. What Data We Collect

### Data you provide directly
- Email address (when you create an account)
- Account password (stored as a secure hash — never in plain text)
- Trade journal entries (instruments, entries, exits, discipline flags)
- Watchlist setups and price alerts
- Account settings and preferences

### Data collected automatically
- Device type and browser (for compatibility purposes)
- General usage patterns (to improve the product)
- First-party visitor counts on the app and sign-in page (see below)

### First-party visitor counts
We count daily unique visitors and pageviews ourselves on the Runnr API (hosted on Railway). We do **not** use Google Analytics or any other third-party analytics service.

On each counted page load, the server hashes the visitor’s IP address together with the UTC date and browser user-agent, using a secret that never leaves the server. The IP address is then discarded. We store only that hash (so we can tell if the visitor is new that UTC day) and the internal counters. Hashes older than two days are deleted. We never store IP addresses.

If your browser sends a **Do Not Track (DNT)** or **Global Privacy Control** signal, we do not record the visit. These totals are internal and are not published.

### Broker integration data
If you connect Alpaca or IBKR Flex, we retrieve your trade history in read-only mode. We do not store your raw broker credentials — API keys and Flex tokens are encrypted at rest using AES/Fernet encryption. We cannot place, modify, or cancel orders on your behalf.

### Payment data
Payments are handled entirely by **Stripe**. Runnr does not store your card number, bank details, or full payment information. Stripe's privacy policy applies to payment processing: stripe.com/privacy.

---

## 3. How We Use Your Data

We use your data to:

- Provide and operate the Runnr service
- Calculate your discipline scores, journal analytics, and Coach insights
- Send weekly digest emails if you have opted in
- Process subscription payments via Stripe
- Respond to support and billing enquiries
- Improve the product based on usage patterns

We do not sell your data. We do not share your trade data with third parties. Coach analytics run on your own journal data only.

---

## 4. Where Your Data Is Stored

Your journal, watchlist, and settings are stored:

- **On your device** (browser localStorage) for offline access
- **In your encrypted cloud profile** hosted on Railway (EU-friendly infrastructure) when you are signed in

We take reasonable technical measures to protect your data, including encryption in transit (HTTPS) and at rest.

First-party visitor hashes and daily counters are stored in the same Railway database as the API. They do not include IP addresses.

---

## 5. Data Retention

We retain your account data for as long as your account is active. If you delete your account, we will remove your personal data within 30 days, except where retention is required by law.

To request account deletion, email info@thinicedigital.com.

---

## 6. Your Rights (GDPR)

If you are located in the European Economic Area or the United Kingdom, you have the following rights under GDPR and UK GDPR:

- **Access:** Request a copy of the personal data we hold about you
- **Rectification:** Request correction of inaccurate data
- **Erasure:** Request deletion of your personal data
- **Portability:** Export your journal data via CSV at any time from within Runnr
- **Objection:** Object to processing of your personal data
- **Withdrawal of consent:** Where processing is based on consent, you may withdraw it at any time

To exercise any of these rights, email info@thinicedigital.com. We will respond within 30 days.

If you are unsatisfied with our response, you have the right to lodge a complaint with your local data protection authority (in the UK: the ICO at ico.org.uk).

---

## 7. Cookies

Runnr uses minimal cookies necessary for session management and authentication. We do not use advertising or tracking cookies. We do not use Google Analytics or any other third-party analytics. First-party visitor counts (described above) do not set a tracking cookie — uniqueness is derived from a daily hash, not a stored identifier on your device.

---

## 8. Third-Party Services

Runnr uses the following third-party services:

| Service | Purpose | Privacy Policy |
|---|---|---|
| Stripe | Payment processing | stripe.com/privacy |
| Railway | Cloud hosting | railway.app/legal/privacy |
| Alpaca | Optional broker sync (read-only) | alpaca.markets/privacy |

---

## 9. Children

Runnr is not intended for use by anyone under the age of 18. We do not knowingly collect data from minors.

---

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify active users of material changes by email. The "last updated" date at the top of this page reflects the most recent revision.

---

## 11. Contact

**Thin Ice Digital Ltd**
Email: info@thinicedigital.com
Website: thinicedigital.com
