import * as React from "react"
import { cn } from "@/lib/utils"
import { Slider as SliderPrimitive } from "radix-ui"
import { focusRing } from "./focus-ring"

/**
 * shadcn's slider, single-thumb: the caller can draw its own track content (the load bar's segments, §5.4) in place of
 * the default range, and pass the thumb its accessible name, value text and key handling (§9.5).
 */
function Slider({
  className,
  trackClassName,
  trackChildren,
  thumbProps,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  trackClassName?: string
  /** Drawn inside the track instead of the default range. */
  trackChildren?: React.ReactNode
  thumbProps?: React.ComponentProps<typeof SliderPrimitive.Thumb>
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn("relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted", trackClassName)}
      >
        {trackChildren ?? <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />}
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
