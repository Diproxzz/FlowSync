import { PaymentsView } from "@/components/payments/PaymentsView";

export const metadata = {
  title: "Credit Payments (Customer Receipts) | InVoiceR",
  description: "Chronological directory of customer payments received, extracted directly from customer ledgers.",
};

export default function CreditPaymentsPage() {
  return <PaymentsView initialType="credit" />;
}
