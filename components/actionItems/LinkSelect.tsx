import type { LinkOptions } from "@/lib/queries/actionItems";

export function LinkSelect({ options, name = "link", defaultValue = "", className = "select" }: { options: LinkOptions; name?: string; defaultValue?: string; className?: string }) {
  return (
    <select name={name} className={className} defaultValue={defaultValue}>
      <option value="">No link</option>
      <optgroup label="Deals">
        {options.deals.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </optgroup>
      <optgroup label="Investments">
        {options.investments.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </optgroup>
      <optgroup label="Funds">
        {options.funds.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </optgroup>
    </select>
  );
}
