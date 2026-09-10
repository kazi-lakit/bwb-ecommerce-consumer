import { Search } from "lucide-react";
import clsx from "clsx";
import { Input, type InputProps } from "./input";

export function SearchInput({ className, ...props }: InputProps) {
  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input type="search" {...props} className={clsx("pl-9", className)} />
    </div>
  );
}
