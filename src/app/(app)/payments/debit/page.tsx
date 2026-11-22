import { PaymentsView } from "@/components/payments/PaymentsView";

export const metadata = {
  title: "Debit Payments (Supplier Payments) | InVoiceR",
  description: "Chronological directory of supplier payments made, extracted directly from supplier ledgers.",
};

export default function DebitPaymentsPage() {
  return <PaymentsView initialType="debit" />;
}
