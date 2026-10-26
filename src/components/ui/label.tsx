import * as React from "react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "block text-xs font-medium text-zinc-400 mb-1.5 tracking-wide uppercase",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";
