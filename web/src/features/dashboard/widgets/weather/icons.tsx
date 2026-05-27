// Inline SVG weather icons mapped from WMO codes. Plain styling so they pick
// up currentColor in the theme — no emoji, per the no-emoji UI rule.

import type { JSX } from "react";

type IconProps = { className?: string; isDay?: boolean };

export function SunIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="4.5" />
        <line x1="12" y1="19.5" x2="12" y2="22" />
        <line x1="2" y1="12" x2="4.5" y2="12" />
        <line x1="19.5" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="4.93" x2="6.7" y2="6.7" />
        <line x1="17.3" y1="17.3" x2="19.07" y2="19.07" />
        <line x1="4.93" y1="19.07" x2="6.7" y2="17.3" />
        <line x1="17.3" y1="6.7" x2="19.07" y2="4.93" />
      </g>
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.5 6.5 0 0 0 11 11z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PartlyCloudyIcon({ className, isDay = true }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      {isDay ? (
        <>
          <circle cx="8" cy="8" r="3" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="8" y1="2" x2="8" y2="3.5" />
            <line x1="2.5" y1="8" x2="4" y2="8" />
            <line x1="4.1" y1="4.1" x2="5.2" y2="5.2" />
            <line x1="11.9" y1="4.1" x2="10.8" y2="5.2" />
          </g>
        </>
      ) : (
        <path d="M16 6.5A4 4 0 1 1 11.5 11a3.5 3.5 0 0 0 4.5-4.5z" fill="currentColor" />
      )}
      <path
        d="M17 19H8a4 4 0 0 1 0-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 19z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

export function CloudIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M17 19H7a4.5 4.5 0 0 1 0-9 5.5 5.5 0 0 1 10.4 1.6A3.5 3.5 0 0 1 17 19z"
        fill="currentColor"
      />
    </svg>
  );
}

export function FogIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M17 11H7a4 4 0 0 1 0-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 11z" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="4" y1="15" x2="20" y2="15" />
        <line x1="3" y1="18.5" x2="14" y2="18.5" />
        <line x1="10" y1="22" x2="21" y2="22" />
      </g>
    </svg>
  );
}

export function DrizzleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M17 13H7a4 4 0 0 1 0-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 13z" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="8" y1="17" x2="7" y2="20" />
        <line x1="13" y1="17" x2="12" y2="20" />
        <line x1="18" y1="17" x2="17" y2="20" />
      </g>
    </svg>
  );
}

export function RainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M17 13H7a4 4 0 0 1 0-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 13z" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="8" y1="16" x2="6.5" y2="21" />
        <line x1="13" y1="16" x2="11.5" y2="21" />
        <line x1="18" y1="16" x2="16.5" y2="21" />
      </g>
    </svg>
  );
}

export function SnowIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M17 13H7a4 4 0 0 1 0-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 13z" fill="currentColor" />
      <g fill="currentColor">
        <circle cx="8" cy="18.5" r="1.2" />
        <circle cx="13" cy="20" r="1.2" />
        <circle cx="18" cy="18.5" r="1.2" />
      </g>
    </svg>
  );
}

export function ThunderIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M17 12H7a4 4 0 0 1 0-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 12z" fill="currentColor" />
      <path d="M13 13l-3 5h3l-1.5 4 4-6h-3l1.5-3z" fill="currentColor" />
    </svg>
  );
}

/**
 * Map a WMO weather code + day/night to an icon + plain-text label.
 * Codes per Open-Meteo: https://open-meteo.com/en/docs#weathervariables
 */
export function wmoIcon(code: number, isDay: boolean): { Icon: (p: IconProps) => JSX.Element; label: string } {
  switch (code) {
    case 0:
      return isDay
        ? { Icon: SunIcon, label: "Clear" }
        : { Icon: MoonIcon, label: "Clear" };
    case 1:
    case 2:
      return { Icon: (p) => <PartlyCloudyIcon {...p} isDay={isDay} />, label: "Partly cloudy" };
    case 3:
      return { Icon: CloudIcon, label: "Overcast" };
    case 45:
    case 48:
      return { Icon: FogIcon, label: "Fog" };
    case 51:
    case 53:
    case 55:
      return { Icon: DrizzleIcon, label: "Drizzle" };
    case 56:
    case 57:
      return { Icon: DrizzleIcon, label: "Freezing drizzle" };
    case 61:
      return { Icon: RainIcon, label: "Light rain" };
    case 63:
      return { Icon: RainIcon, label: "Rain" };
    case 65:
      return { Icon: RainIcon, label: "Heavy rain" };
    case 66:
    case 67:
      return { Icon: RainIcon, label: "Freezing rain" };
    case 71:
      return { Icon: SnowIcon, label: "Light snow" };
    case 73:
      return { Icon: SnowIcon, label: "Snow" };
    case 75:
      return { Icon: SnowIcon, label: "Heavy snow" };
    case 77:
      return { Icon: SnowIcon, label: "Snow grains" };
    case 80:
    case 81:
    case 82:
      return { Icon: RainIcon, label: "Showers" };
    case 85:
    case 86:
      return { Icon: SnowIcon, label: "Snow showers" };
    case 95:
    case 96:
    case 99:
      return { Icon: ThunderIcon, label: "Thunderstorm" };
    default:
      return { Icon: CloudIcon, label: "Unknown" };
  }
}
