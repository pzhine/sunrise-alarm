import { Ref } from 'vue';

// Define EasingFunction type
export type EasingFunction = (progress: number) => number;

// Helper function to convert OKLCH to RGB
// Based on Oklab color space by Björn Ottosson
export function oklchToRgb(
  l: number,
  c: number,
  h: number
): [number, number, number] {
  const h_rad = h * (Math.PI / 180);
  const a_lab = c * Math.cos(h_rad);
  const b_lab = c * Math.sin(h_rad);
  const l_lab = l;

  // Oklab to LMS-like intermediate values
  let l_ = l_lab + 0.3963377774 * a_lab + 0.2158037573 * b_lab;
  let m_ = l_lab - 0.1055613458 * a_lab - 0.0638541728 * b_lab;
  let s_ = l_lab - 0.0894841775 * a_lab - 1.291485548 * b_lab;

  // Cube to get to linear-like LMS space
  const l_c = l_ * l_ * l_;
  const m_c = m_ * m_ * m_;
  const s_c = s_ * s_ * s_;

  // Transform to linear sRGB (D65)
  let r_lin = +4.0767416649 * l_c - 3.3077115913 * m_c + 0.2309699264 * s_c;
  let g_lin = -1.2684380046 * l_c + 2.6097574011 * m_c - 0.3413193965 * s_c;
  let b_lin = -0.0041960863 * l_c - 0.7034186147 * m_c + 1.707614701 * s_c;

  // Gamma correction and scale
  const to_srgb = (val: number): number => {
    const v = Math.max(0, Math.min(1, val)); // Clamp to [0, 1] before gamma
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
  };

  const r_srgb = to_srgb(r_lin);
  const g_srgb = to_srgb(g_lin);
  const b_srgb = to_srgb(b_lin);

  return [
    Math.round(Math.max(0, Math.min(1, r_srgb)) * 255),
    Math.round(Math.max(0, Math.min(1, g_srgb)) * 255),
    Math.round(Math.max(0, Math.min(1, b_srgb)) * 255),
  ];
}

// Helper function to parse color string to RGB array
export function parseColor(
  colorString: string
): [number, number, number] | null {
  if (!colorString) return null;

  const lowerColorString = colorString.toLowerCase().trim();

  // Try to match oklch(L C H [/ A])
  const oklchMatch = lowerColorString.match(
    /^oklch\s*\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(deg|rad|grad|turn)?(?:\s*\/\s*[\d.]+%?)?\s*\)$/i
  );

  if (oklchMatch) {
    let l_val = parseFloat(oklchMatch[1]);
    if (oklchMatch[1].endsWith('%')) {
      l_val /= 100;
    }
    l_val = Math.max(0, Math.min(1, l_val)); // Clamp L to [0, 1]

    const c_val = parseFloat(oklchMatch[2]);
    let h_val = parseFloat(oklchMatch[3]);
    const unit = oklchMatch[4];

    if (unit === 'rad') {
      h_val = h_val * (180 / Math.PI);
    } else if (unit === 'grad') {
      h_val = h_val * 0.9; // 360/400
    } else if (unit === 'turn') {
      h_val = h_val * 360;
    }
    // Normalize H to [0, 360)
    h_val = ((h_val % 360) + 360) % 360;

    return oklchToRgb(l_val, c_val, h_val);
  }

  // Try to match rgb() or rgba()
  const rgbMatch = lowerColorString.match(
    /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d\.]+)?\s*\)$/i
  );
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1]),
      parseInt(rgbMatch[2]),
      parseInt(rgbMatch[3]),
    ];
  }

  // Handle named colors (simple cases)
  if (lowerColorString === 'white') {
    return [255, 255, 255];
  } else if (lowerColorString === 'black') {
    return [0, 0, 0];
  }

  // Try to match hex codes: #RRGGBB or #RGB
  const hexMatchFull = lowerColorString.match(
    /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i
  );
  if (hexMatchFull) {
    return [
      parseInt(hexMatchFull[1], 16),
      parseInt(hexMatchFull[2], 16),
      parseInt(hexMatchFull[3], 16),
    ];
  }

  const hexMatchShort = lowerColorString.match(
    /^#?([a-f\\d])([a-f\\d])([a-f\\d])$/i
  );
  if (hexMatchShort) {
    return [
      parseInt(hexMatchShort[1] + hexMatchShort[1], 16),
      parseInt(hexMatchShort[2] + hexMatchShort[2], 16),
      parseInt(hexMatchShort[3] + hexMatchShort[3], 16),
    ];
  }

  console.warn(
    `[AnimationUtils] Could not parse color string: \\"${colorString}\\". Color animation might not be smooth.`
  );
  return null; // Return null if no format matches
}

// Helper function for smooth animation of numeric or color properties
export function animateStyle(
  targetValue: number | string,
  getValue: () => number | string,
  setValue: (val: any) => void,
  duration: number,
  animationIntervalsRef: Ref<NodeJS.Timeout[]>, // Added parameter
  propertyType: 'number' | 'color' = 'number',
  steps: number = 50,
  easing?: EasingFunction // Added optional easing function parameter
) {
  const initialValue = getValue();
  const intervalTime = Math.max(16, duration / steps);
  const actualSteps = Math.max(1, Math.round(duration / intervalTime));

  let currentStep = 0;

  const intervalId = setInterval(() => {
    currentStep++;
    let progress = currentStep / actualSteps;

    if (easing) {
      progress = easing(progress);
    }
    progress = Math.max(0, Math.min(1, progress)); // Ensure progress stays within [0,1]

    if (
      propertyType === 'number' &&
      typeof initialValue === 'number' &&
      typeof targetValue === 'number'
    ) {
      const newValue = initialValue + (targetValue - initialValue) * progress;
      setValue(newValue);
    } else if (
      propertyType === 'color' &&
      typeof initialValue === 'string' &&
      typeof targetValue === 'string'
    ) {
      const startRGB = parseColor(initialValue as string);
      const endRGB = parseColor(targetValue as string);

      if (!startRGB || !endRGB) {
        // Error handling or setValue(targetValue) should be here as before
        // For brevity, assuming it exists from previous version
        if (currentStep >= actualSteps) {
          // Ensure cleanup even on error
          clearInterval(intervalId);
          setValue(targetValue);
          animationIntervalsRef.value = animationIntervalsRef.value.filter(
            (id) => id !== intervalId
          );
        }
        return;
      }

      const r = Math.round(startRGB[0] + (endRGB[0] - startRGB[0]) * progress);
      const g = Math.round(startRGB[1] + (endRGB[1] - startRGB[1]) * progress);
      const b = Math.round(startRGB[2] + (endRGB[2] - startRGB[2]) * progress);
      setValue(`rgb(${r},${g},${b})`);
    }

    if (currentStep >= actualSteps) {
      clearInterval(intervalId);
      // Ensure target is met precisely
      if (propertyType === 'number' && typeof targetValue === 'number') {
        setValue(targetValue);
      } else if (propertyType === 'color' && typeof targetValue === 'string') {
        const endRGB = parseColor(targetValue as string);
        if (endRGB) setValue(`rgb(${endRGB[0]},${endRGB[1]},${endRGB[2]})`);
        else setValue(targetValue); // Fallback if target parsing fails
      }
      animationIntervalsRef.value = animationIntervalsRef.value.filter(
        (id) => id !== intervalId
      );
    }
  }, intervalTime);
  animationIntervalsRef.value.push(intervalId);
}

export const easeInOutBezier = (t: number) =>
  cubicBezierEasing(t, 0.86, 0.11, 0.19, 0.81);

// Helper function for customizable Cubic Bezier easing
export function cubicBezierEasing(
  t: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  if (x1 === y1 && x2 === y2) {
    return t; // Linear easing if control points are diagonal
  }

  // Precompute coefficients for x(u) = Ax*u^3 + Bx*u^2 + Cx*u
  const Cx = 3.0 * x1;
  const Bx = 3.0 * (x2 - x1) - Cx;
  const Ax = 1.0 - Cx - Bx;

  // Precompute coefficients for y(u) = Ay*u^3 + By*u^2 + Cy*u
  const Cy = 3.0 * y1;
  const By = 3.0 * (y2 - y1) - Cy;
  const Ay = 1.0 - Cy - By;

  // Solve for u given t (where t is the x coordinate)
  // using Newton-Raphson iteration
  let u = t; // Initial guess
  const NEWTON_ITERATIONS = 8;
  const NEWTON_MIN_STEP = 1e-5; // Tolerance for error

  for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
    // Calculate x(u) and x'(u)
    const u2 = u * u;
    const u3 = u2 * u;

    const currentX = Ax * u3 + Bx * u2 + Cx * u;
    const currentDerivativeX = 3.0 * Ax * u2 + 2.0 * Bx * u + Cx;

    if (currentDerivativeX === 0) {
      break; // Avoid division by zero
    }

    const error = currentX - t;
    if (Math.abs(error) < NEWTON_MIN_STEP) {
      break; // Converged
    }
    u -= error / currentDerivativeX;
    u = Math.max(0, Math.min(1, u)); // Clamp u to [0, 1] as it can go out of bounds
  }

  // Calculate y(u)
  const u2_final = u * u;
  const u3_final = u2_final * u;
  return Ay * u3_final + By * u2_final + Cy * u;
}
