import * as React from "react"
import { cn } from "@/lib/utils"
import { Slider as SliderPrimitive } from "radix-ui"
import { focusRing } from "./focus-ring"

/**
 * shadcn's slider, single-thumb. `bare` leaves the track undrawn for a caller that draws its own beneath it (the load
 * bar's segments, §5.4); `thumbProps` give the thumb its accessible name, value text, key handling and ref (§9.5).
 */
function Slider({
  className,
  bare = false,
  thumbProps,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  bare?: boolean
  thumbProps?: React.ComponentProps<typeof SliderPrimitive.Thumb>
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn("relative h-1.5 w-full grow overflow-hidden rounded-full", bare ? "bg-transparent" : "bg-muted")}
      >
        {!bare && <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />}
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        {...thumbProps}
        className={cn(
          `block h-5 w-1.5 shrink-0 rounded-full border-2 border-text-primary bg-surface-card ${focusRing} disabled:pointer-events-none disabled:opacity-50`,
          thumbProps?.className
        )}
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
