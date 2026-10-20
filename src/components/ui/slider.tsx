import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, "aria-label": ariaLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center data-[orientation=vertical]:flex-col data-[orientation=vertical]:justify-center data-[orientation=vertical]:py-2", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative grow overflow-hidden rounded-full bg-primary/20 data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5">
      <SliderPrimitive.Range className="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full" />
    </SliderPrimitive.Track>
    {/* aria-label belongs on the thumb (the [role=slider] element), not the root. */}
    <SliderPrimitive.Thumb aria-label={ariaLabel} className="relative block h-5 w-5 rounded-full border border-primary bg-card shadow before:absolute before:left-1/2 before:top-1/2 before:size-12 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
