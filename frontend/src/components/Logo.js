import React from 'react';

/**
 * Profx Logo component.
 * - variant="icon" (default): just the cube mark, square
 * - variant="lockup": cube + "Profx" wordmark side-by-side
 *
 * Size is controlled via the `size` prop (height in pixels).
 * Icon: defaults to 32. Lockup: defaults to 36.
 */
export default function Logo({ variant = 'icon', size, className = '', style = {} }) {
  if (variant === 'lockup') {
    const h = size || 36;
    return (
      <img
        src="/logo-nav.svg"
        alt="Profx"
        height={h}
        className={className}
        style={{ height: h, width: 'auto', display: 'block', ...style }}
      />
    );
  }
  const h = size || 32;
  return (
    <img
      src="/logo-icon.svg"
      alt="Profx"
      width={h}
      height={h}
      className={className}
      style={{ width: h, height: h, display: 'block', ...style }}
    />
  );
}
