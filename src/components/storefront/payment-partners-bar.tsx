const PARTNERS = ["VISA", "Mastercard", "bKash", "Dutch-Bangla Bank", "Nagad", "City Bank"];

export function PaymentPartnersBar() {
  return (
    <section className="rounded-md bg-surface-soft px-6 py-10 text-center">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Payment Partners</h2>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {PARTNERS.map((partner) => (
          <span
            key={partner}
            className="rounded-sm border border-hairline bg-surface px-4 py-2 text-xs font-medium text-steel"
          >
            {partner}
          </span>
        ))}
      </div>
    </section>
  );
}
