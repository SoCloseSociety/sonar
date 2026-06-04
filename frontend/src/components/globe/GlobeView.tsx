import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Globe, { GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useMapStore } from '@/stores/mapStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useEventStore } from '@/stores/eventStore';
import { GlobeControls } from './GlobeControls';
import { GlobeHUD } from './GlobeHUD';
import { GlobeDetail } from './GlobeDetail';
import { GlobeLegend } from './GlobeLegend';
import type { QualityMode, ViewMode } from './GlobeLegend';
import api from '@/services/api';
import { getSocket } from '@/services/socket';
import { RotateCcw } from 'lucide-react';

// ── Types ──

interface GlobeEvent {
  id: number;
  lat: number;
  lng: number;
  severity: number;
  category: string;
  summary: string;
  source: string;
  source_url?: string;
  created_at: string;
  country?: string;
  impact_score?: number;
  keywords?: string[];
}

interface TrackingPoint {
  lat: number;
  lng: number;
  altitude: number;
  color: string;
  size: number;
  label: string;
  type: 'flight' | 'vessel' | 'webcam';
  isMilitary?: boolean;
  heading?: number;
  callsign?: string;
  icao24?: string;
  origin_country?: string;
  velocity?: number;
  squawk?: string;
  is_government?: boolean;
  flightAltitude?: number;
  mmsi?: string;
  vessel_name?: string;
  vessel_type?: number;
  vessel_type_name?: string;
  flag?: string;
  imo?: string;
  speed?: number;
  destination?: string;
  is_dark?: boolean;
  thumbnail?: string;
  player_url?: string;
  webcam_country?: string;
  webcam_city?: string;
  webcam_status?: string;
}

type InfraLayerType = 'military' | 'nuclear' | 'oil' | 'gas' | 'energy' | 'chokepoint' | 'mining' | 'water' | 'tech' | 'port' | 'submarine_cable';

interface StaticMarker {
  lat: number;
  lng: number;
  name: string;
  country: string;
  type: string;
  branch?: string;
  status?: string;
  risk?: string;
  operator?: string;
  capacity?: string;
  strategic?: string;
  category?: string;
  layerType: InfraLayerType;
}

interface GlobeObjectPoint {
  lat: number;
  lng: number;
  altitude: number;
  kind: 'event' | 'static' | 'hazard';
  color: string;
  spriteSize: number;
  eventData?: GlobeEvent;
  staticData?: StaticMarker;
  layerType?: InfraLayerType;
  hazardType?: string;
  severity?: number;
}

const INFRA_COLORS: Record<InfraLayerType, string> = {
  military: '#f59e0b',
  nuclear: '#a855f7',
  oil: '#f97316',
  gas: '#3b82f6',
  energy: '#eab308',
  chokepoint: '#ef4444',
  mining: '#10b981',
  water: '#06b6d4',
  tech: '#ec4899',
  port: '#8b5cf6',
  submarine_cable: '#14b8a6',
};

const INFRA_LABELS: Record<InfraLayerType, string> = {
  military: 'MILITARY BASE',
  nuclear: 'NUCLEAR SITE',
  oil: 'OIL INFRASTRUCTURE',
  gas: 'GAS INFRASTRUCTURE',
  energy: 'ENERGY FACILITY',
  chokepoint: 'MARITIME CHOKEPOINT',
  mining: 'MINING SITE',
  water: 'WATER INFRASTRUCTURE',
  tech: 'TECH FACILITY',
  port: 'STRATEGIC PORT',
  submarine_cable: 'SUBMARINE CABLE HUB',
};

// ── Constants ──

// Matched to 2D map sevColor scale
const SEV_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
  info: '#06b6d4',
};

const CATEGORY_COLORS: Record<string, string> = {
  MILITARY_CONFLICT: '#ef4444',
  NUCLEAR: '#a855f7',
  TERRORISM: '#dc2626',
  EARTHQUAKE: '#f97316',
  NATURAL_DISASTER: '#f97316',
  WEATHER: '#38bdf8',
  FIRE: '#ef4444',
  CYBER_ATTACK: '#a855f7',
  MARITIME_SECURITY: '#3b82f6',
  AVIATION_INCIDENT: '#f59e0b',
  SANCTIONS: '#f97316',
  DIPLOMATIC: '#3b82f6',
  ECONOMIC_POLICY: '#10b981',
  ELECTION: '#8b5cf6',
  PANDEMIC_HEALTH: '#ec4899',
};

const CATEGORY_EMOJIS: Record<string, string> = {
  MILITARY_CONFLICT: '\u2694\uFE0F',
  DIPLOMATIC: '\uD83C\uDFF3\uFE0F',
  ECONOMIC_POLICY: '\uD83D\uDCC8',
  NATURAL_DISASTER: '\uD83C\uDF0A',
  NUCLEAR: '\u2622\uFE0F',
  SANCTIONS: '\uD83D\uDEAB',
  ELECTION: '\uD83D\uDDF3\uFE0F',
  CRYPTO_MARKET: '\u20BF',
  ENERGY_COMMODITIES: '\u26FD',
  TERRORISM: '\uD83D\uDCA3',
  CYBER_ATTACK: '\uD83D\uDEE1\uFE0F',
  MARITIME_SECURITY: '\u2693',
  AVIATION_INCIDENT: '\u2708\uFE0F',
  EARTHQUAKE: '\uD83C\uDF0B',
  WEATHER: '\u26C8\uFE0F',
  FIRE: '\uD83D\uDD25',
  TECHNOLOGY: '\uD83D\uDD2C',
  POLITICAL_DOMESTIC: '\uD83C\uDFDB\uFE0F',
  PANDEMIC_HEALTH: '\uD83C\uDFE5',
  INFRASTRUCTURE: '\uD83C\uDFD7\uFE0F',
};

// Matched to 2D map sevColor breakpoints (9/7/5/3)
function getSevLevel(s: number) {
  if (s >= 9) return 'critical';
  if (s >= 7) return 'high';
  if (s >= 5) return 'medium';
  if (s >= 3) return 'low';
  return 'info';
}

// ── Canvas texture cache for 3D sprite icons (bounded) ──
const TEXTURE_CACHE_LIMIT = 500;
const textureCache = new Map<string, THREE.CanvasTexture>();

function pruneTextureCache() {
  if (textureCache.size <= TEXTURE_CACHE_LIMIT) return;
  const keys = [...textureCache.keys()];
  const toRemove = keys.slice(0, textureCache.size - TEXTURE_CACHE_LIMIT);
  for (const key of toRemove) {
    textureCache.get(key)?.dispose();
    textureCache.delete(key);
  }
}

function getAircraftTexture(color: string, isMilitary: boolean): THREE.CanvasTexture {
  const key = `aircraft-${color}-${isMilitary}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const S = 192;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  const h = S / 2;
  ctx.save();
  ctx.translate(h, h);

  // Engine trail / exhaust glow (behind the aircraft)
  const trailGrad = ctx.createLinearGradient(0, 44, 0, h * 0.95);
  trailGrad.addColorStop(0, color + '50');
  trailGrad.addColorStop(0.5, color + '18');
  trailGrad.addColorStop(1, color + '00');
  ctx.fillStyle = trailGrad;
  ctx.beginPath();
  ctx.moveTo(-4, 44);
  ctx.lineTo(4, 44);
  ctx.lineTo(6, h * 0.95);
  ctx.lineTo(-6, h * 0.95);
  ctx.closePath();
  ctx.fill();

  // Outer glow halo
  const grad = ctx.createRadialGradient(0, 0, 12, 0, 0, h * 0.85);
  grad.addColorStop(0, color + '30');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(-h, -h, S, S);

  // Airplane body
  ctx.shadowColor = color;
  ctx.shadowBlur = isMilitary ? 16 : 8;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff20';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (isMilitary) {
    // Fighter jet: delta wings, twin tail
    ctx.moveTo(0, -58);
    ctx.lineTo(4, -46);
    ctx.lineTo(6, -24);
    ctx.lineTo(10, -14);
    ctx.lineTo(52, 12);
    ctx.lineTo(48, 17);
    ctx.lineTo(12, 5);
    ctx.lineTo(12, 28);
    ctx.lineTo(28, 46);
    ctx.lineTo(22, 48);
    ctx.lineTo(10, 36);
    ctx.lineTo(7, 52);
    ctx.lineTo(0, 54);
    ctx.lineTo(-7, 52);
    ctx.lineTo(-10, 36);
    ctx.lineTo(-22, 48);
    ctx.lineTo(-28, 46);
    ctx.lineTo(-12, 28);
    ctx.lineTo(-12, 5);
    ctx.lineTo(-48, 17);
    ctx.lineTo(-52, 12);
    ctx.lineTo(-10, -14);
    ctx.lineTo(-6, -24);
    ctx.lineTo(-4, -46);
  } else {
    // Airliner: straight wings, T-tail
    ctx.moveTo(0, -56);
    ctx.lineTo(5, -42);
    ctx.lineTo(6, -22);
    ctx.lineTo(54, -5);
    ctx.lineTo(52, 0);
    ctx.lineTo(8, -5);
    ctx.lineTo(8, 30);
    ctx.lineTo(22, 42);
    ctx.lineTo(20, 45);
    ctx.lineTo(8, 36);
    ctx.lineTo(6, 44);
    ctx.lineTo(4, 52);
    ctx.lineTo(0, 54);
    ctx.lineTo(-4, 52);
    ctx.lineTo(-6, 44);
    ctx.lineTo(-8, 36);
    ctx.lineTo(-20, 45);
    ctx.lineTo(-22, 42);
    ctx.lineTo(-8, 30);
    ctx.lineTo(-8, -5);
    ctx.lineTo(-52, 0);
    ctx.lineTo(-54, -5);
    ctx.lineTo(-6, -22);
    ctx.lineTo(-5, -42);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Fuselage center highlight
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, -8, 3, 28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cockpit glass
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#88ddff';
  ctx.shadowColor = '#88ddff';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.ellipse(0, isMilitary ? -44 : -42, 2.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Navigation lights: red (port/left), green (starboard/right), white (tail)
  ctx.globalAlpha = 0.9;
  // Left wing tip — red
  ctx.fillStyle = '#ff2200';
  ctx.shadowColor = '#ff2200';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(isMilitary ? -50 : -52, isMilitary ? 13 : -3, 3, 0, Math.PI * 2);
  ctx.fill();
  // Right wing tip — green
  ctx.fillStyle = '#00ff44';
  ctx.shadowColor = '#00ff44';
  ctx.beginPath();
  ctx.arc(isMilitary ? 50 : 52, isMilitary ? 13 : -3, 3, 0, Math.PI * 2);
  ctx.fill();
  // Tail — white strobe
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(0, 52, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Military chevron marking
  if (isMilitary) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.lineTo(0, -2);
    ctx.lineTo(8, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, 12);
    ctx.lineTo(0, 4);
    ctx.lineTo(8, 12);
    ctx.stroke();
  }

  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  pruneTextureCache();
  return texture;
}

function getVesselTexture(color: string, isDark: boolean): THREE.CanvasTexture {
  const key = `vessel-${color}-${isDark}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const S = 192;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  const h = S / 2;
  ctx.save();
  ctx.translate(h, h);

  // Wake trail (V-shape behind ship)
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  // Left wake line
  ctx.beginPath();
  ctx.moveTo(-3, 52);
  ctx.quadraticCurveTo(-18, 72, -32, h * 0.95);
  ctx.stroke();
  // Right wake line
  ctx.beginPath();
  ctx.moveTo(3, 52);
  ctx.quadraticCurveTo(18, 72, 32, h * 0.95);
  ctx.stroke();
  // Center foam
  const wakeGrad = ctx.createLinearGradient(0, 52, 0, h * 0.95);
  wakeGrad.addColorStop(0, '#ffffff20');
  wakeGrad.addColorStop(1, '#ffffff00');
  ctx.fillStyle = wakeGrad;
  ctx.beginPath();
  ctx.moveTo(-2, 52);
  ctx.lineTo(2, 52);
  ctx.lineTo(4, h * 0.95);
  ctx.lineTo(-4, h * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Outer glow
  const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, h * 0.8);
  grad.addColorStop(0, color + '30');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(-h, -h, S, S);

  // Hull
  ctx.shadowColor = color;
  ctx.shadowBlur = isDark ? 16 : 8;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff20';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -56);
  ctx.quadraticCurveTo(8, -44, 12, -28);
  ctx.lineTo(17, -5);
  ctx.lineTo(20, 16);
  ctx.lineTo(18, 34);
  ctx.lineTo(15, 46);
  ctx.lineTo(10, 52);
  ctx.lineTo(-10, 52);
  ctx.lineTo(-15, 46);
  ctx.lineTo(-18, 34);
  ctx.lineTo(-20, 16);
  ctx.lineTo(-17, -5);
  ctx.lineTo(-12, -28);
  ctx.quadraticCurveTo(-8, -44, 0, -56);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Deck line
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.lineTo(14, -2);
  ctx.stroke();

  // Superstructure / bridge block
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(-9, -10, 18, 22, 2);
  ctx.fill();

  // Funnel / chimney
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#dddddd';
  ctx.beginPath();
  ctx.roundRect(-3, 14, 6, 10, 1);
  ctx.fill();

  // Bridge windows (row of lights)
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#88ddff';
  ctx.shadowColor = '#88ddff';
  ctx.shadowBlur = 4;
  for (let i = -6; i <= 6; i += 3) {
    ctx.fillRect(i - 1, -8, 2, 2);
  }
  ctx.shadowBlur = 0;

  // Bow marking
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -52);
  ctx.lineTo(0, -24);
  ctx.stroke();

  // Navigation lights
  ctx.globalAlpha = 0.8;
  // Port (left) — red
  ctx.fillStyle = '#ff2200';
  ctx.shadowColor = '#ff2200';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(-18, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Starboard (right) — green
  ctx.fillStyle = '#00ff44';
  ctx.shadowColor = '#00ff44';
  ctx.beginPath();
  ctx.arc(18, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Stern — white
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(0, 50, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Dark ship — pulsing red ring + "DARK" indicator
  if (isDark) {
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#ff2200';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.stroke();
    // Inner warning ring
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  pruneTextureCache();
  return texture;
}

function getWebcamTexture(color: string): THREE.CanvasTexture {
  const key = `webcam-${color}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  const h = S / 2;
  ctx.save();
  ctx.translate(h, h);
  // Glow
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, h * 0.8);
  grad.addColorStop(0, color + '50');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(-h, -h, S, S);
  // Outer ring
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  // Inner dark
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  // Lens highlight
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-2, -2, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  pruneTextureCache();
  return texture;
}

// ── Hazard textures ──

function getEarthquakeTexture(color: string): THREE.CanvasTexture {
  const key = `earthquake-${color}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const S = 96, h = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.translate(h, h);
  // Outer glow
  const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, h * 0.9);
  grad.addColorStop(0, color + '70');
  grad.addColorStop(0.6, color + '20');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(-h, -h, S, S);
  // Concentric seismic rings (4 rings for more detail)
  for (let i = 4; i >= 1; i--) {
    ctx.beginPath();
    ctx.arc(0, 0, i * 8, 0, Math.PI * 2);
    ctx.strokeStyle = color + (i === 1 ? 'ff' : i === 2 ? 'aa' : i === 3 ? '55' : '30');
    ctx.lineWidth = i === 1 ? 2.5 : i === 2 ? 2 : 1.5;
    ctx.stroke();
  }
  // Center epicenter
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  // White hot center
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  pruneTextureCache();
  return texture;
}

function getWeatherTexture(color: string): THREE.CanvasTexture {
  const key = `weather-${color}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const S = 96, h = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.translate(h, h);
  // Glow
  const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, h * 0.9);
  grad.addColorStop(0, color + '60');
  grad.addColorStop(0.7, color + '15');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(-h, -h, S, S);
  // Cloud shape (larger, more defined)
  ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(-8, 3, 11, 0, Math.PI * 2);
  ctx.arc(8, 3, 11, 0, Math.PI * 2);
  ctx.arc(0, -4, 13, 0, Math.PI * 2);
  ctx.fill();
  // Cloud highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff22';
  ctx.beginPath();
  ctx.arc(-4, -8, 6, 0, Math.PI * 2);
  ctx.fill();
  // Lightning bolt (brighter, with glow)
  ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 6;
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(2, 8); ctx.lineTo(-4, 18); ctx.lineTo(0, 15);
  ctx.lineTo(-3, 28); ctx.lineTo(6, 14); ctx.lineTo(2, 17);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  pruneTextureCache();
  return texture;
}

function getFireTexture(color: string): THREE.CanvasTexture {
  const key = `fire-${color}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const S = 96, h = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.translate(h, h);
  // Heat glow
  const grad = ctx.createRadialGradient(0, 2, 8, 0, 2, h * 0.9);
  grad.addColorStop(0, color + '70');
  grad.addColorStop(0.5, color + '20');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(-h, -h, S, S);
  // Outer flame (larger)
  ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -22); ctx.quadraticCurveTo(16, -6, 14, 10);
  ctx.quadraticCurveTo(8, 22, 0, 18);
  ctx.quadraticCurveTo(-8, 22, -14, 10);
  ctx.quadraticCurveTo(-16, -6, 0, -22);
  ctx.fill();
  // Mid flame (orange)
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fb923c';
  ctx.beginPath();
  ctx.moveTo(0, -14); ctx.quadraticCurveTo(10, -2, 8, 8);
  ctx.quadraticCurveTo(5, 16, 0, 13);
  ctx.quadraticCurveTo(-5, 16, -8, 8);
  ctx.quadraticCurveTo(-10, -2, 0, -14);
  ctx.fill();
  // Inner flame (bright yellow)
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.quadraticCurveTo(5, 0, 4, 5);
  ctx.quadraticCurveTo(2, 10, 0, 8);
  ctx.quadraticCurveTo(-2, 10, -4, 5);
  ctx.quadraticCurveTo(-5, 0, 0, -8);
  ctx.fill();
  // White hot core
  ctx.fillStyle = '#ffffff88';
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  pruneTextureCache();
  return texture;
}

function getCyberTexture(color: string): THREE.CanvasTexture {
  const key = `cyber-${color}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const S = 96, h = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.translate(h, h);
  // Digital glow
  const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, h * 0.9);
  grad.addColorStop(0, color + '60');
  grad.addColorStop(0.5, color + '18');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(-h, -h, S, S);
  // Outer targeting circle
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.stroke();
  // Inner circle
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color + '88'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.stroke();
  // Crosshair lines (with gaps at circle intersections)
  ctx.strokeStyle = color + 'cc'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-22, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(30, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(0, 30); ctx.stroke();
  // Corner brackets (digital HUD feel)
  ctx.strokeStyle = color + '66'; ctx.lineWidth = 1;
  const bk = 16;
  ctx.beginPath(); ctx.moveTo(-bk, -bk); ctx.lineTo(-bk, -bk + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bk, -bk); ctx.lineTo(-bk + 6, -bk); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bk, -bk); ctx.lineTo(bk, -bk + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bk, -bk); ctx.lineTo(bk - 6, -bk); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bk, bk); ctx.lineTo(-bk, bk - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bk, bk); ctx.lineTo(-bk + 6, bk); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bk, bk); ctx.lineTo(bk, bk - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bk, bk); ctx.lineTo(bk - 6, bk); ctx.stroke();
  // Center dot (bright)
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  pruneTextureCache();
  return texture;
}

// ── Event & Infrastructure marker textures (for objectsData layer) ──

function getEventMarkerTexture(color: string, isHigh: boolean): THREE.CanvasTexture {
  const key = `evt-${color}-${isHigh}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const S = 128, h = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.translate(h, h);
  // Outer glow
  const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, h * 0.9);
  grad.addColorStop(0, color + '60');
  grad.addColorStop(0.4, color + '20');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(-h, -h, S, S);
  // Outer pulse ring for high severity
  if (isHigh) {
    ctx.strokeStyle = color + '70';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Main filled circle
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, isHigh ? 20 : 16, 0, Math.PI * 2);
  ctx.fill();
  // White border
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Inner highlight
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-4, -5, isHigh ? 8 : 6, 0, Math.PI * 2);
  ctx.fill();
  // Center bright core
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  pruneTextureCache();
  return texture;
}

function getInfraMarkerTexture(color: string, layerType: InfraLayerType): THREE.CanvasTexture {
  const key = `infra-${color}-${layerType}`;
  if (textureCache.has(key)) return textureCache.get(key)!;
  const S = 128, h = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.translate(h, h);
  // Outer glow
  const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, h * 0.85);
  grad.addColorStop(0, color + '45');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(-h, -h, S, S);
  // Shape
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color + 'dd';
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  switch (layerType) {
    case 'military': // Shield
      ctx.moveTo(0, -26); ctx.lineTo(22, -14); ctx.lineTo(22, 8);
      ctx.quadraticCurveTo(22, 26, 0, 30);
      ctx.quadraticCurveTo(-22, 26, -22, 8);
      ctx.lineTo(-22, -14); ctx.closePath(); break;
    case 'nuclear': // Hexagon
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 - 90) * Math.PI / 180;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * 24, Math.sin(a) * 24);
      } ctx.closePath(); break;
    case 'oil': // Droplet
      ctx.moveTo(0, -28);
      ctx.quadraticCurveTo(24, -2, 18, 14);
      ctx.quadraticCurveTo(12, 28, 0, 28);
      ctx.quadraticCurveTo(-12, 28, -18, 14);
      ctx.quadraticCurveTo(-24, -2, 0, -28);
      ctx.closePath(); break;
    case 'chokepoint': // Inverted triangle (anchor)
      ctx.moveTo(0, 28); ctx.lineTo(-24, -18); ctx.lineTo(24, -18);
      ctx.closePath(); break;
    case 'mining': // Diamond
      ctx.moveTo(0, -28); ctx.lineTo(22, 0);
      ctx.lineTo(0, 28); ctx.lineTo(-22, 0);
      ctx.closePath(); break;
    case 'energy': // 5-pointed star
      for (let i = 0; i < 5; i++) {
        const outer = (i * 72 - 90) * Math.PI / 180;
        const inner = ((i * 72 + 36) - 90) * Math.PI / 180;
        ctx.lineTo(Math.cos(outer) * 26, Math.sin(outer) * 26);
        ctx.lineTo(Math.cos(inner) * 13, Math.sin(inner) * 13);
      } ctx.closePath(); break;
    case 'tech': // Rounded square (chip)
      ctx.roundRect(-20, -20, 40, 40, 5); break;
    case 'port': // Pentagon
      for (let i = 0; i < 5; i++) {
        const a = (i * 72 - 90) * Math.PI / 180;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * 24, Math.sin(a) * 24);
      } ctx.closePath(); break;
    default: // Circle (gas, water, submarine_cable)
      ctx.arc(0, 0, 22, 0, Math.PI * 2); break;
  }
  ctx.fill();
  ctx.stroke();
  // Inner detail
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-4, -4, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  pruneTextureCache();
  return texture;
}

// ── Source quality scoring (for VERIFIED/CRITICAL filter) ──
const TRUSTED_SOURCES = new Set([
  'reuters', 'ap', 'bbc', 'al jazeera', 'aljazeera', 'bloomberg', 'afp',
  'dpa', 'xinhua', 'tass', 'guardian', 'nytimes', 'ft', 'economist',
  'washingtonpost', 'wapo', 'france24', 'dw', 'nhk', 'skynews',
  'bellingcat', 'acled', 'iaea', 'un', 'nato', 'icrc',
]);
function isSourceTrusted(source: string): boolean {
  if (!source) return false;
  const s = String(source).toLowerCase();
  for (const t of TRUSTED_SOURCES) { if (s.includes(t)) return true; }
  return false;
}

// ── Country centroids for globe labels — kept to 30 most strategic for perf ──
const COUNTRY_LABELS: { lat: number; lng: number; name: string }[] = [
  { lat: 38.9, lng: -77.04, name: 'USA' }, { lat: 55.75, lng: 37.62, name: 'RUSSIA' },
  { lat: 39.9, lng: 116.4, name: 'CHINA' }, { lat: 28.61, lng: 77.21, name: 'INDIA' },
  { lat: 51.5, lng: -0.12, name: 'UK' }, { lat: 48.86, lng: 2.35, name: 'FRANCE' },
  { lat: 52.52, lng: 13.4, name: 'GERMANY' }, { lat: 35.68, lng: 139.69, name: 'JAPAN' },
  { lat: -15.79, lng: -47.88, name: 'BRAZIL' }, { lat: 45.42, lng: -75.7, name: 'CANADA' },
  { lat: 50.45, lng: 30.52, name: 'UKRAINE' }, { lat: 39.93, lng: 32.86, name: 'TURKEY' },
  { lat: 35.7, lng: 51.42, name: 'IRAN' }, { lat: 31.77, lng: 35.23, name: 'ISRAEL' },
  { lat: 24.71, lng: 46.68, name: 'SAUDI ARABIA' }, { lat: 30.04, lng: 31.24, name: 'EGYPT' },
  { lat: 33.51, lng: 36.29, name: 'SYRIA' }, { lat: 33.31, lng: 44.37, name: 'IRAQ' },
  { lat: 37.57, lng: 126.98, name: 'S. KOREA' }, { lat: 39.04, lng: 125.75, name: 'N. KOREA' },
  { lat: 33.69, lng: 73.04, name: 'PAKISTAN' }, { lat: 34.52, lng: 69.17, name: 'AFGHANISTAN' },
  { lat: 6.52, lng: 3.38, name: 'NIGERIA' }, { lat: 2.05, lng: 45.32, name: 'SOMALIA' },
  { lat: 15.6, lng: 32.53, name: 'SUDAN' }, { lat: 32.9, lng: 13.18, name: 'LIBYA' },
  { lat: -6.21, lng: 106.85, name: 'INDONESIA' }, { lat: -26.2, lng: 28.05, name: 'S. AFRICA' },
  { lat: 19.43, lng: -99.13, name: 'MEXICO' }, { lat: -33.87, lng: 151.21, name: 'AUSTRALIA' },
];

// ── Component ──

export function GlobeView() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
  const [globeEvents, setGlobeEvents] = useState<GlobeEvent[]>([]);
  const [webcams, setWebcams] = useState<TrackingPoint[]>([]);
  const [staticMarkers, setStaticMarkers] = useState<StaticMarker[]>([]);
  const [conflictZones, setConflictZones] = useState<{ geometry: GeoJSON.Geometry; properties: Record<string, unknown> }[]>([]);
  const [geoFeatures, setGeoFeatures] = useState<GeoJSON.Feature[]>([]);
  const [earthquakeEvents, setEarthquakeEvents] = useState<GlobeEvent[]>([]);
  const [weatherEvents, setWeatherEvents] = useState<GlobeEvent[]>([]);
  const [fireEvents, setFireEvents] = useState<GlobeEvent[]>([]);
  const [cyberEvents, setCyberEvents] = useState<GlobeEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<GlobeEvent | null>(null);
  const [selectedTracking, setSelectedTracking] = useState<TrackingPoint | null>(null);
  const [selectedStatic, setSelectedStatic] = useState<StaticMarker | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; events: GlobeEvent[]; severity: number; count: number } | null>(null);
  const [mouseCoords, setMouseCoords] = useState({ lat: 0, lng: 0 });
  const [autoRotating, setAutoRotating] = useState(true);
  const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);
  const [qualityMode, setQualityMode] = useState<QualityMode>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('standard');
  const [sensitiveZones, setSensitiveZones] = useState<{ name: string; lat: number; lon: number; risk_score: number }[]>([]);
  const { layers } = useMapStore();
  // Stable individual booleans — each useMemo depends only on what it uses, NOT on the full layers array
  const layerVis = useMemo(() => {
    const v: Record<string, boolean> = {};
    for (const l of layers) v[l.id] = l.visible;
    return v;
  }, [layers]);
  const showEvents    = layerVis['events']    ?? false;
  const showMilitary  = layerVis['military']  ?? false;
  const showNuclear   = layerVis['nuclear']   ?? false;
  const showConflicts = layerVis['conflicts'] ?? false;
  const showFlights   = layerVis['flights']   ?? false;
  const showVessels   = layerVis['vessels']   ?? false;
  const showWebcams   = layerVis['webcams']   ?? false;
  const showEQ        = layerVis['earthquakes'] ?? false;
  const showWX        = layerVis['weather']   ?? false;
  const showFires     = layerVis['fires']     ?? false;
  const showCyber     = layerVis['cyber']     ?? false;
  const showOil       = layerVis['oil']       ?? false;
  const showGas       = layerVis['gas']       ?? false;
  const showEnergy    = layerVis['energy']    ?? false;
  const showChokepoint= layerVis['chokepoint']?? false;
  const showMining    = layerVis['mining']    ?? false;
  const showWater     = layerVis['water']     ?? false;
  const showTech      = layerVis['tech']      ?? false;
  const showPort      = layerVis['port']      ?? false;
  const showSubCable  = layerVis['submarine_cable'] ?? false;
  const flights = useTrackingStore((s) => s.flights);
  const vessels = useTrackingStore((s) => s.vessels);
  const externalSelectedEvent = useEventStore((s) => s.selectedEvent);
  const clearExternalEvent = useEventStore((s) => s.setSelectedEvent);

  // ── Stop/resume auto-rotation ──
  const stopAutoRotation = useCallback(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = false;
    setAutoRotating(false);
  }, []);

  const resumeAutoRotation = useCallback(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2;
    setAutoRotating(true);
  }, []);

  // ── Resize observer (throttled 200ms) ──
  useEffect(() => {
    if (!containerRef.current) return;
    let rafId = 0;
    const obs = new ResizeObserver((entries) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) setDimensions({ w: width, h: height });
      });
    });
    obs.observe(containerRef.current);
    return () => { obs.disconnect(); cancelAnimationFrame(rafId); };
  }, []);

  // ── Configure globe — clean dark terminal style ──
  useEffect(() => {
    if (!globeRef.current) return;
    const globe = globeRef.current;
    const scene = globe.scene();

    // Deep space background
    scene.background = new THREE.Color(0x030508);

    // Star field -- adds depth and immersion
    const oldStars = scene.getObjectByName('sonar-stars') as THREE.Points | undefined;
    if (oldStars) {
      scene.remove(oldStars);
      oldStars.geometry?.dispose();
      (oldStars.material as THREE.Material | undefined)?.dispose();
    }
    const starCount = 4000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 800 + Math.random() * 400;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
      starSizes[i] = 0.3 + Math.random() * 1.2;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
    const starMat = new THREE.PointsMaterial({
      color: 0x8899bb,
      size: 0.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
    });
    const starField = new THREE.Points(starGeo, starMat);
    starField.name = 'sonar-stars';
    scene.add(starField);

    // Lighting — soft, even illumination (no dramatic directional)
    scene.children.forEach((child: THREE.Object3D) => {
      if (child instanceof THREE.DirectionalLight) {
        child.intensity = 0.6;
        child.color.set(0xc0c8d8);
      }
      if (child instanceof THREE.AmbientLight) {
        child.intensity = 0.25;
        child.color.set(0x404858);
      }
    });

    // Globe surface -- dark with subtle blue tint, slight sheen
    const globeMesh = scene.children.find(
      (c: THREE.Object3D) => c instanceof THREE.Mesh && (c as THREE.Mesh).geometry?.type === 'SphereGeometry'
    ) as THREE.Mesh | undefined;
    if (globeMesh && globeMesh.material) {
      const mat = globeMesh.material as THREE.MeshPhongMaterial;
      mat.color = new THREE.Color(0x0c1018);
      mat.emissive = new THREE.Color(0x060a12);
      mat.emissiveIntensity = 0.35;
      mat.shininess = 8;
      mat.specular = new THREE.Color(0x1a2540);
      mat.needsUpdate = true;
    }

    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 50;
    controls.maxDistance = 500;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.5;

    const onInteractionStart = () => {
      if (controls.autoRotate) {
        controls.autoRotate = false;
        setAutoRotating(false);
      }
    };
    controls.addEventListener('start', onInteractionStart);

    globe.pointOfView({ lat: 30, lng: 20, altitude: 1.8 }, 0);

    return () => {
      controls.removeEventListener('start', onInteractionStart);
      const existing = scene.getObjectByName('sonar-stars') as THREE.Points | undefined;
      if (existing) {
        scene.remove(existing);
        existing.geometry.dispose();
        (existing.material as THREE.Material).dispose();
      }
    };
  }, []);

  // ── Fetch events ──
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/map/events', { params: { hours: 48 } });
        const mapped: GlobeEvent[] = (data || [])
          .filter((e: Record<string, unknown>) => e.latitude != null && e.longitude != null && e.latitude !== 0 && e.longitude !== 0)
          .map((e: Record<string, unknown>) => {
            const str = (v: unknown, fallback = ''): string => (v != null && typeof v !== 'object') ? String(v) : fallback;
            return {
              id: Number(e.id) || 0,
              lat: Number(e.latitude) || 0,
              lng: Number(e.longitude) || 0,
              severity: Number(e.severity) || 0,
              category: str(e.category) || String(e.source || 'EVENT').toUpperCase(),
              summary: str(e.summary) || `${str(e.source, 'unknown')} event`,
              source: str(e.source, 'unknown'),
              source_url: str(e.source_url),
              created_at: str(e.created_at, new Date().toISOString()),
              country: str(e.country),
              impact_score: Number(e.impact_score) || 0,
              keywords: Array.isArray(e.keywords) ? e.keywords.filter((k: unknown) => typeof k === 'string') as string[] : typeof e.keywords === 'string' ? (e.keywords as string).split(',').map((k: string) => k.trim()) : [],
            };
          });
        setGlobeEvents(mapped);
      } catch (err) {
        console.error('[SONAR] Globe events fetch failed:', err);
      }
    };
    load();
    const iv = setInterval(load, 120000);
    return () => clearInterval(iv);
  }, []);

  // ── Always fetch tracking data ──
  useEffect(() => {
    useTrackingStore.getState().fetchFlights();
    useTrackingStore.getState().fetchVessels();
    const iv1 = setInterval(() => useTrackingStore.getState().fetchFlights(), 30000);
    const iv2 = setInterval(() => useTrackingStore.getState().fetchVessels(), 60000);
    const socket = getSocket();
    const handleTrackingUpdate = (payload: { type: string }) => {
      if (payload.type === 'flights') useTrackingStore.getState().fetchFlights();
      else if (payload.type === 'vessels') useTrackingStore.getState().fetchVessels();
    };
    socket.on('tracking_update', handleTrackingUpdate);
    return () => {
      clearInterval(iv1);
      clearInterval(iv2);
      socket.off('tracking_update', handleTrackingUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch webcams ──
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/map/webcams');
        if (Array.isArray(data)) {
          setWebcams(data
            .filter((c: Record<string, unknown>) => c.lat != null && c.lon != null)
            .map((c: Record<string, unknown>) => ({
              lat: c.lat as number,
              lng: c.lon as number,
              altitude: 0.003,
              size: 0.18,
              color: '#06b6d4',
              label: (c.name as string) || 'Webcam',
              type: 'webcam' as const,
              thumbnail: c.thumbnail as string,
              player_url: c.player_url as string,
              webcam_country: c.country as string,
              webcam_city: c.city as string,
              webcam_status: c.status as string,
            })));
        }
      } catch (err) {
        console.error('[SONAR] Globe webcams fetch failed:', err);
      }
    };
    load();
  }, []);

  // ── Load static GeoJSON ──
  useEffect(() => {
    // Load conflict zones
    fetch('/data/conflict_zones.geojson')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.features) {
          setConflictZones(data.features.map((f: GeoJSON.Feature) => ({
            geometry: f.geometry,
            properties: f.properties || {},
          })));
        }
      })
      .catch(() => console.warn('[SONAR] Failed to load conflict zones'));

    Promise.all([
      fetch('/data/military_bases.geojson').then(r => r.ok ? r.json() : null),
      fetch('/data/nuclear_sites.geojson').then(r => r.ok ? r.json() : null),
      fetch('/data/strategic_infrastructure.geojson').then(r => r.ok ? r.json() : null),
    ]).then(([milData, nucData, infraData]) => {
      const markers: StaticMarker[] = [];
      if (milData?.features) {
        for (const f of milData.features) {
          if (f.geometry?.type !== 'Point') continue;
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          if (!coords || coords.length < 2) continue;
          markers.push({
            lat: coords[1], lng: coords[0],
            name: f.properties?.name || '', country: f.properties?.country || '',
            type: f.properties?.type || '', branch: f.properties?.branch || '',
            layerType: 'military',
          });
        }
      }
      if (nucData?.features) {
        for (const f of nucData.features) {
          if (f.geometry?.type !== 'Point') continue;
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          if (!coords || coords.length < 2) continue;
          markers.push({
            lat: coords[1], lng: coords[0],
            name: f.properties?.name || '', country: f.properties?.country || '',
            type: f.properties?.type || '', status: f.properties?.status || '',
            risk: f.properties?.risk || '', layerType: 'nuclear',
          });
        }
      }
      if (infraData?.features) {
        const categoryToLayer: Record<string, InfraLayerType> = {
          oil: 'oil', gas: 'gas', energy: 'energy', chokepoint: 'chokepoint',
          mining: 'mining', water: 'water', tech: 'tech', port: 'port',
          cyber: 'submarine_cable', nuclear: 'nuclear',
        };
        for (const f of infraData.features) {
          if (f.geometry?.type !== 'Point') continue;
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          if (!coords || coords.length < 2) continue;
          const p = f.properties || {};
          const lt = categoryToLayer[p.category] || 'energy';
          markers.push({
            lat: coords[1], lng: coords[0],
            name: p.name || '', country: p.country || '',
            type: p.type || '', status: p.status || '',
            risk: p.risk || '', operator: p.operator || '',
            capacity: p.capacity || '', strategic: p.strategic || '',
            category: p.category || '', layerType: lt,
          });
        }
      }
      setStaticMarkers(markers);
    }).catch(() => console.warn('[SONAR] Failed to load static markers'));

    // Fetch country GeoJSON once (choropleth computed via useMemo from globeEvents)
    fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.features) setGeoFeatures(data.features); })
      .catch(err => console.error('[SONAR] Country GeoJSON fetch failed:', err));

    // Fetch sensitive zones for rings layer
    api.get('/map/sensitive-zones').then(({ data }) => {
      if (Array.isArray(data)) {
        setSensitiveZones(data.map((z: Record<string, unknown>) => ({
          name: String(z.name || ''),
          lat: Number(z.lat) || 0,
          lon: Number(z.lon) || 0,
          risk_score: Number(z.risk_score) || 0,
        })));
      }
    }).catch(() => {});
  }, []);

  // ── Fetch hazard-layer events (only when layer visible, debounced 300ms) ──
  useEffect(() => {
    const mapEvent = (e: Record<string, unknown>): GlobeEvent => ({
      id: Number(e.id) || 0, lat: Number(e.latitude) || 0, lng: Number(e.longitude) || 0,
      severity: Number(e.severity) || 0,
      category: String(e.category || 'EVENT'),
      summary: String(e.summary || ''),
      source: String(e.source || 'unknown'), source_url: String(e.source_url || ''),
      created_at: String(e.created_at || ''), country: String(e.country || ''),
      impact_score: Number(e.impact_score) || 0,
      keywords: Array.isArray(e.keywords) ? e.keywords.filter((k: unknown) => typeof k === 'string') as string[] : [],
    });
    const filterPts = (data: Record<string, unknown>[]) =>
      (data || []).filter(e => e.latitude != null && e.longitude != null && e.latitude !== 0 && e.longitude !== 0);

    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      if (!showEQ) setEarthquakeEvents([]);
      else {
        try {
          const { data } = await api.get('/map/events', { params: { hours: 48, category: 'EARTHQUAKE' } });
          if (!cancelled) setEarthquakeEvents(filterPts(data).map(mapEvent));
        } catch { if (!cancelled) setEarthquakeEvents([]); }
      }
      if (!showWX) setWeatherEvents([]);
      else {
        try {
          const { data } = await api.get('/map/events', { params: { hours: 48, category: 'WEATHER' } });
          if (!cancelled) setWeatherEvents(filterPts(data).map(mapEvent));
        } catch { if (!cancelled) setWeatherEvents([]); }
      }
      if (!showFires) setFireEvents([]);
      else {
        try {
          const { data } = await api.get('/map/events', { params: { hours: 48, category: 'FIRE' } });
          if (!cancelled) setFireEvents(filterPts(data).map(mapEvent));
        } catch { if (!cancelled) setFireEvents([]); }
      }
      if (!showCyber) setCyberEvents([]);
      else {
        try {
          const { data } = await api.get('/map/events', { params: { hours: 48, category: 'CYBER_ATTACK' } });
          if (!cancelled) setCyberEvents(filterPts(data).map(mapEvent));
        } catch { if (!cancelled) setCyberEvents([]); }
      }
    };

    // 300ms debounce prevents rapid cascade on layer toggles
    const debounce = setTimeout(load, 300);
    // Stagger at 135s (offset from main 120s event fetch to avoid network congestion)
    const iv = setInterval(load, 135000);
    return () => { cancelled = true; clearTimeout(debounce); clearInterval(iv); };
  }, [showEQ, showWX, showFires, showCyber]);

  // ── Animate pulsing glow on critical markers ──
  useEffect(() => {
    if (!globeRef.current) return;
    let frameId: number;
    const animate = () => {
      if (!globeRef.current) return;
      const scene = globeRef.current.scene();
      const t = performance.now();
      scene.traverse((obj: THREE.Object3D) => {
        if (obj.name === 'pulse-glow' && obj instanceof THREE.Sprite) {
          const birth = (obj.parent?.userData?.birthTime as number) || t;
          const phase = ((t - birth) % 2000) / 2000;
          const sinVal = Math.sin(phase * Math.PI * 2);
          (obj.material as THREE.SpriteMaterial).opacity = 0.12 + 0.2 * sinVal;
          const base = ((obj.parent?.userData?.markerData as GlobeObjectPoint)?.spriteSize || 1) * 3.5 * 2.0;
          const s = base * (1 + 0.12 * sinVal);
          obj.scale.set(s, s, 1);
        }
      });
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // ── Watch for external event selection (from IntelFeed sidebar click) ──
  useEffect(() => {
    if (!externalSelectedEvent || !globeRef.current) return;
    stopAutoRotation();

    const ev: GlobeEvent = {
      id: externalSelectedEvent.id,
      lat: externalSelectedEvent.latitude || 0,
      lng: externalSelectedEvent.longitude || 0,
      severity: externalSelectedEvent.severity,
      category: externalSelectedEvent.category || 'EVENT',
      summary: externalSelectedEvent.summary || '',
      source: externalSelectedEvent.source,
      source_url: externalSelectedEvent.source_url,
      created_at: externalSelectedEvent.created_at,
      country: externalSelectedEvent.country,
      impact_score: externalSelectedEvent.impact_score,
      keywords: externalSelectedEvent.keywords,
    };

    setSelectedTracking(null);
    setSelectedStatic(null);
    setSelectedEvent(ev);

    if (ev.lat && ev.lng) {
      globeRef.current.pointOfView({ lat: ev.lat, lng: ev.lng, altitude: 0.35 }, 1200);
    }

    // Clear so it can be re-triggered for the same event
    clearExternalEvent(null);
  }, [externalSelectedEvent, stopAutoRotation, clearExternalEvent]);

  // ── Derived data ──

  // Apply quality/noise filter to events
  const filteredEvents = useMemo(() => {
    if (qualityMode === 'critical') return globeEvents.filter(e => e.severity >= 8);
    if (qualityMode === 'verified') return globeEvents.filter(e => e.severity >= 5 || isSourceTrusted(e.source));
    return globeEvents;
  }, [globeEvents, qualityMode]);


  // Unified object markers (events + static markers + hazards) — rendered as custom 3D sprites
  // Split into 3 independent useMemos to minimize re-computation scope

  const eventMarkers = useMemo<GlobeObjectPoint[]>(() => {
    if (!showEvents) return [];
    return filteredEvents.map(e => ({
      lat: e.lat, lng: e.lng, altitude: 0.008,
      kind: 'event' as const,
      spriteSize: e.severity >= 9 ? 1.2 : e.severity >= 7 ? 1.0 : e.severity >= 5 ? 0.8 : 0.6,
      color: SEV_COLORS[getSevLevel(e.severity)] || '#06b6d4',
      eventData: e,
      severity: e.severity,
    }));
  }, [filteredEvents, showEvents]);

  const staticAndInfraMarkers = useMemo<GlobeObjectPoint[]>(() => {
    const pts: GlobeObjectPoint[] = [];
    const showMilNuc = viewMode === 'standard' || viewMode === 'military' || viewMode === 'strategic';

    if (showMilNuc && showMilitary) {
      staticMarkers.filter(m => m.layerType === 'military').forEach(m => {
        pts.push({ lat: m.lat, lng: m.lng, altitude: 0.006, kind: 'static', spriteSize: 0.9, color: '#f59e0b', staticData: m, layerType: 'military' });
      });
    }
    if (showMilNuc && showNuclear) {
      staticMarkers.filter(m => m.layerType === 'nuclear').forEach(m => {
        pts.push({ lat: m.lat, lng: m.lng, altitude: 0.006, kind: 'static', spriteSize: 1.0, color: '#a855f7', staticData: m, layerType: 'nuclear' });
      });
    }

    const infraLayers: { layerType: InfraLayerType; visible: boolean }[] = [
      { layerType: 'oil', visible: showOil },
      { layerType: 'gas', visible: showGas },
      { layerType: 'energy', visible: showEnergy },
      { layerType: 'chokepoint', visible: showChokepoint },
      { layerType: 'mining', visible: showMining },
      { layerType: 'water', visible: showWater },
      { layerType: 'tech', visible: showTech },
      { layerType: 'port', visible: showPort },
      { layerType: 'submarine_cable', visible: showSubCable },
    ];
    for (const il of infraLayers) {
      if (il.visible) {
        const color = INFRA_COLORS[il.layerType];
        staticMarkers.filter(m => m.layerType === il.layerType).forEach(m => {
          const riskSize = m.risk === 'critical' ? 1.1 : m.risk === 'high' ? 0.95 : 0.8;
          pts.push({ lat: m.lat, lng: m.lng, altitude: 0.006, kind: 'static', spriteSize: riskSize, color, staticData: m, layerType: il.layerType });
        });
      }
    }
    return pts;
  }, [staticMarkers, showMilitary, showNuclear, showOil, showGas, showEnergy, showChokepoint,
      showMining, showWater, showTech, showPort, showSubCable, viewMode]);

  const hazardMarkers = useMemo<GlobeObjectPoint[]>(() => {
    if (viewMode !== 'standard') return [];
    const pts: GlobeObjectPoint[] = [];
    const hazardLayers: { id: string; events: GlobeEvent[]; color: string; hazardType: string }[] = [
      { id: 'earthquakes', events: earthquakeEvents, color: '#f97316', hazardType: 'earthquake' },
      { id: 'weather', events: weatherEvents, color: '#3b82f6', hazardType: 'weather' },
      { id: 'fires', events: fireEvents, color: '#ef4444', hazardType: 'fire' },
      { id: 'cyber', events: cyberEvents, color: '#8b5cf6', hazardType: 'cyber' },
    ];
    for (const hl of hazardLayers) {
      if (layerVis[hl.id]) {
        hl.events.forEach(e => {
          pts.push({
            lat: e.lat, lng: e.lng, altitude: 0.008,
            kind: 'hazard',
            spriteSize: e.severity >= 7 ? 1.0 : e.severity >= 5 ? 0.8 : 0.65,
            color: hl.color, eventData: e, hazardType: hl.hazardType,
            severity: e.severity,
          });
        });
      }
    }
    return pts;
  }, [earthquakeEvents, weatherEvents, fireEvents, cyberEvents, layerVis, viewMode]);

  // Combine the 3 sub-arrays (cheap concat, only re-runs when a sub-array reference changes)
  const objectMarkers = useMemo<GlobeObjectPoint[]>(
    () => [...eventMarkers, ...staticAndInfraMarkers, ...hazardMarkers],
    [eventMarkers, staticAndInfraMarkers, hazardMarkers]
  );

  // Tracking overlay (flights + vessels + webcams)
  // Performance: prioritize military/gov/special, cap civilian to avoid GPU overload
  const customData = useMemo<TrackingPoint[]>(() => {
    const points: TrackingPoint[] = [];

    if (showFlights) {
      const milFlights = flights.filter(f => f.is_military || f.is_government ||
        (f.squawk && ['7500','7600','7700'].includes(f.squawk)));
      const civFlights = flights.filter(f => !f.is_military && !f.is_government &&
        !(f.squawk && ['7500','7600','7700'].includes(f.squawk)));
      // Cap total to 300 for GPU perf (military always shown, civilians capped)
      const CIV_CAP = 300;
      let displayFlights: typeof flights;
      if (viewMode === 'military' || viewMode === 'strategic') {
        displayFlights = milFlights;
      } else {
        displayFlights = [...milFlights, ...civFlights.slice(0, Math.max(0, CIV_CAP - milFlights.length))];
      }
      displayFlights.forEach(f => {
        points.push({
          lat: f.latitude, lng: f.longitude,
          size: f.is_military ? 1.0 : 0.6,
          color: f.is_military ? '#ef4444' : f.is_government ? '#f59e0b' : '#94a3b8',
          altitude: 0.010 + (f.altitude || 0) / 250000,
          label: f.callsign || f.icao24,
          type: 'flight',
          isMilitary: f.is_military,
          heading: f.heading,
          callsign: f.callsign, icao24: f.icao24,
          origin_country: f.origin_country,
          velocity: f.velocity, squawk: f.squawk,
          is_government: f.is_government,
          flightAltitude: f.altitude,
        });
      });
    }

    if (showVessels) {
      const milVessels = vessels.filter(v => v.is_military || v.is_dark);
      const civVessels = vessels.filter(v => !v.is_military && !v.is_dark);
      const VES_CAP = 200;
      const displayVessels = (viewMode === 'military' || viewMode === 'strategic')
        ? milVessels
        : [...milVessels, ...civVessels.slice(0, Math.max(0, VES_CAP - milVessels.length))];
      displayVessels.forEach(v => {
        points.push({
          lat: v.latitude, lng: v.longitude,
          size: v.is_military ? 0.9 : 0.55,
          color: v.is_military ? '#ef4444' : (v.is_dark ? '#f97316' : '#3b82f6'),
          altitude: 0.007,
          label: v.vessel_name || v.mmsi,
          type: 'vessel',
          isMilitary: v.is_military,
          heading: v.heading,
          mmsi: v.mmsi, vessel_name: v.vessel_name,
          vessel_type: v.vessel_type, vessel_type_name: v.vessel_type_name,
          flag: v.flag, imo: v.imo,
          speed: v.speed, destination: v.destination,
          is_dark: v.is_dark,
        });
      });
    }

    if (showWebcams && viewMode === 'standard') {
      webcams.forEach(c => points.push({ ...c, size: 0.35 }));
    }

    return points;
  }, [flights, vessels, webcams, showFlights, showVessels, showWebcams, viewMode]);

  // Arcs removed — were causing GPU overhead with 15 animated dashed arcs
  // Events are now linked visually by shared color on the choropleth map


  // Compute country severity choropleth from globeEvents + GeoJSON (no double API call)
  const countrySeverity = useMemo(() => {
    if (!geoFeatures.length) return { features: [] as GeoJSON.Feature[] };

    // Build normalized country scores: aggregate by uppercase key
    const countryScores: Record<string, { maxSev: number; count: number }> = {};
    for (const e of globeEvents) {
      const c = e.country;
      if (!c) continue;
      const key = String(c).toUpperCase().trim();
      if (!countryScores[key]) countryScores[key] = { maxSev: 0, count: 0 };
      countryScores[key].maxSev = Math.max(countryScores[key].maxSev, e.severity || 0);
      countryScores[key].count += 1;
    }

    // Common aliases: event data may use short names, ISO codes, or variant spellings
    const COUNTRY_ALIASES: Record<string, string[]> = {
      'UNITED STATES OF AMERICA': ['US', 'USA', 'UNITED STATES', 'U.S.', 'U.S.A.'],
      'UNITED KINGDOM': ['UK', 'GB', 'GREAT BRITAIN', 'BRITAIN', 'ENGLAND'],
      'RUSSIAN FEDERATION': ['RUSSIA', 'RU'],
      'KOREA, REPUBLIC OF': ['SOUTH KOREA', 'S. KOREA', 'KR'],
      "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": ['NORTH KOREA', 'N. KOREA', 'DPRK', 'KP'],
      'IRAN, ISLAMIC REPUBLIC OF': ['IRAN', 'IR'],
      'SYRIA': ['SYRIAN ARAB REPUBLIC', 'SY'],
      'VENEZUELA': ['VENEZUELA, BOLIVARIAN REPUBLIC OF', 'VE'],
      'BOLIVIA': ['BOLIVIA, PLURINATIONAL STATE OF', 'BO'],
      'TANZANIA': ['TANZANIA, UNITED REPUBLIC OF', 'TZ'],
      'CONGO, DEMOCRATIC REPUBLIC OF THE': ['DRC', 'DR CONGO', 'CONGO-KINSHASA', 'CD'],
      'CONGO': ['REPUBLIC OF THE CONGO', 'CONGO-BRAZZAVILLE', 'CG'],
      'COTE D\'IVOIRE': ['IVORY COAST', 'CI'],
      'CZECHIA': ['CZECH REPUBLIC', 'CZ'],
      'ESWATINI': ['SWAZILAND', 'SZ'],
      'MYANMAR': ['BURMA', 'MM'],
      'PALESTINE': ['PALESTINIAN TERRITORY', 'PS', 'GAZA', 'WEST BANK'],
      'TAIWAN': ['TAIWAN, PROVINCE OF CHINA', 'TW', 'CHINESE TAIPEI'],
      'SAUDI ARABIA': ['SA', 'KSA'],
      'UNITED ARAB EMIRATES': ['UAE', 'AE'],
      'UKRAINE': ['UA'],
      'CHINA': ['CN', 'PRC', "PEOPLE'S REPUBLIC OF CHINA"],
      'JAPAN': ['JP'],
      'INDIA': ['IN'],
      'IRAQ': ['IQ'],
      'AFGHANISTAN': ['AF'],
      'PAKISTAN': ['PK'],
      'ISRAEL': ['IL'],
      'EGYPT': ['EG'],
      'SUDAN': ['SD', 'SOUTH SUDAN'],
      'LIBYA': ['LY'],
      'YEMEN': ['YE'],
      'LEBANON': ['LB'],
      'SOMALIA': ['SO'],
      'ETHIOPIA': ['ET'],
      'NIGERIA': ['NG'],
    };

    // Build a lookup: any variant → canonical name
    const aliasLookup: Record<string, string> = {};
    for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
      aliasLookup[canonical] = canonical;
      for (const alias of aliases) aliasLookup[String(alias).toUpperCase()] = canonical;
    }

    // Resolve an event country key to a canonical form
    function resolveCountry(key: string): string {
      return aliasLookup[key] || key;
    }

    // Merge scores by canonical name
    const mergedScores: Record<string, { maxSev: number; count: number }> = {};
    for (const [key, val] of Object.entries(countryScores)) {
      const canonical = resolveCountry(key);
      if (!mergedScores[canonical]) mergedScores[canonical] = { maxSev: 0, count: 0 };
      mergedScores[canonical].maxSev = Math.max(mergedScores[canonical].maxSev, val.maxSev);
      mergedScores[canonical].count += val.count;
    }

    return {
      features: geoFeatures.map(f => {
        const props = { ...f.properties } as Record<string, unknown>;
        const name = (props.name as string) || (props.NAME as string) || '';
        const nameUpper = String(name).toUpperCase().trim();
        const iso2 = String((props.iso_a2 as string) || '').toUpperCase().trim();
        const iso3 = String((props.iso_a3 as string) || '').toUpperCase().trim();

        // Try exact match first (canonical name, then GeoJSON name variants)
        const canonical = resolveCountry(nameUpper);
        let score = mergedScores[canonical] || mergedScores[nameUpper] || mergedScores[iso2] || mergedScores[iso3];

        // If no match yet, check if any merged key resolves to same canonical as this country
        if (!score) {
          const resolvedIso = resolveCountry(iso2);
          score = mergedScores[resolvedIso] || undefined;
        }

        // Last resort: only match if the event key is long enough (>=5 chars) and is an exact word match
        // This prevents "US" matching "RUSSIA", "NIGER" matching "NIGERIA", etc.
        if (!score) {
          for (const [key, val] of Object.entries(mergedScores)) {
            if (key.length < 5) continue; // skip short keys to avoid false positives
            if (key === nameUpper || nameUpper === key) {
              score = val;
              break;
            }
          }
        }

        props._sevScore = score?.maxSev || 0;
        props._evtCount = score?.count || 0;
        return { ...f, properties: props };
      }),
    };
  }, [geoFeatures, globeEvents]);

  // Country borders + conflict zone overlays only
  // Countries without events: fully transparent fill, subtle border only
  // Countries with high severity: subtle colored fill (no 3D altitude)
  // Conflict zones: colored overlay with slight altitude
  const countryPolygons = useMemo(() => {
    const polygons: { properties: Record<string, unknown>; geometry: GeoJSON.Geometry }[] =
      countrySeverity.features.map(f => {
        const sev = (f.properties?._sevScore as number) || 0;

        // Only color countries with actual conflict-level severity (>= 5)
        // Everything else: transparent fill, thin border for country outlines
        let fill: string;
        let stroke: string;
        if (sev >= 9)      { fill = 'rgba(220,38,38,0.18)'; stroke = 'rgba(220,38,38,0.50)'; }
        else if (sev >= 7) { fill = 'rgba(239,68,68,0.12)'; stroke = 'rgba(239,68,68,0.40)'; }
        else if (sev >= 5) { fill = 'rgba(245,158,11,0.08)'; stroke = 'rgba(245,158,11,0.30)'; }
        else               { fill = 'rgba(0,0,0,0)';         stroke = 'rgba(60,90,140,0.12)'; }

        return {
          properties: {
            ...f.properties,
            _isConflict: false,
            _capColor: fill,
            _strokeColor: stroke,
            _altitude: 0.001, // flat — no 3D blocks
          },
          geometry: f.geometry as GeoJSON.Geometry,
        };
      });

    if (showConflicts) {
      conflictZones.forEach(cz => {
        const sev = (cz.properties.severity as number) || 7;
        let fill: string;
        let stroke: string;
        if (sev >= 9)      { fill = 'rgba(220,38,38,0.25)'; stroke = 'rgba(220,38,38,0.80)'; }
        else if (sev >= 7) { fill = 'rgba(239,68,68,0.18)'; stroke = 'rgba(239,68,68,0.65)'; }
        else               { fill = 'rgba(245,158,11,0.12)'; stroke = 'rgba(245,158,11,0.50)'; }
        polygons.push({
          properties: {
            ...cz.properties,
            _isConflict: true,
            _sevScore: sev,
            _capColor: fill,
            _strokeColor: stroke,
            _altitude: 0.004, // slight lift for conflict zones only
          },
          geometry: cz.geometry,
        });
      });
    }

    return polygons;
  }, [countrySeverity, conflictZones, showConflicts]);

  // ── Handlers ──

  const handleGlobeClick = useCallback((coords: { lat: number; lng: number }) => {
    setMouseCoords(coords);
  }, []);

  const handleTrackingClick = useCallback((obj: object) => {
    const group = obj as THREE.Group;
    const d = group?.userData?.trackingData as TrackingPoint | undefined;
    if (!d) return;
    stopAutoRotation();
    setSelectedEvent(null);
    setSelectedTracking(d);
    globeRef.current?.pointOfView({ lat: d.lat, lng: d.lng, altitude: 0.4 }, 1200);
  }, [stopAutoRotation]);

  const flyTo = useCallback((lat: number, lng: number, alt = 0.5) => {
    stopAutoRotation();
    globeRef.current?.pointOfView({ lat, lng, altitude: alt }, 1200);
  }, [stopAutoRotation]);

  // ── Sensitive zone rings ──
  const ringsData = useMemo(() => {
    return sensitiveZones.map(z => ({
      lat: z.lat,
      lng: z.lon,
      maxR: 3 + z.risk_score * 0.3,
      propagationSpeed: 1.5,
      repeatPeriod: 1200,
      color: z.risk_score >= 8 ? 'rgba(255,58,58,0.20)' : z.risk_score >= 5 ? 'rgba(255,168,0,0.18)' : 'rgba(0,207,235,0.15)',
      _name: z.name,
      _risk: z.risk_score,
    }));
  }, [sensitiveZones]);

  const closeDetail = useCallback(() => {
    setSelectedEvent(null);
    setSelectedTracking(null);
    setSelectedStatic(null);
    setSelectedCountry(null);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-black" onMouseLeave={() => setHoverTooltip(null)}>
      <Globe
        ref={globeRef}
        width={dimensions.w}
        height={dimensions.h}
        globeImageUrl=""
        showAtmosphere={true}
        atmosphereColor="#1a4a7a"
        atmosphereAltitude={0.18}
        animateIn={false}
        rendererConfig={{ antialias: false, powerPreference: 'high-performance', precision: 'mediump' }}

        // ── Country borders + severity choropleth ──
        polygonsData={countryPolygons}
        polygonCapColor={(d: object) => ((d as { properties?: Record<string, unknown> }).properties?._capColor as string) || 'rgba(0,0,0,0)'}
        polygonSideColor={() => 'rgba(0,0,0,0)'}
        polygonStrokeColor={(d: object) => ((d as { properties?: Record<string, unknown> }).properties?._strokeColor as string) || 'rgba(60,90,140,0.12)'}
        polygonAltitude={(d: object) => ((d as { properties?: Record<string, unknown> }).properties?._altitude as number) || 0.001}
        onPolygonClick={(polygon: object) => {
          const props = (polygon as { properties?: Record<string, unknown> }).properties;
          if (!props || props._isConflict) return;
          const countryName = (props.name as string) || (props.NAME as string) || '';
          if (!countryName) return;
          stopAutoRotation();
          // Find events for this country — exact match only (no substring)
          const cName = String(countryName).toUpperCase().trim();
          const countryEvents = globeEvents.filter(e => {
            const eName = String(e.country || '').toUpperCase().trim();
            return eName === cName;
          });
          const maxSev = countryEvents.reduce((max, e) => Math.max(max, e.severity), 0);
          setSelectedEvent(null);
          setSelectedTracking(null);
          setSelectedStatic(null);
          setSelectedCountry({
            name: countryName,
            events: countryEvents.slice(0, 10),
            severity: maxSev,
            count: countryEvents.length,
          });
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        polygonGeoJsonGeometry={(d: object) => (d as any).geometry}

        // ── Sensitive zone rings ──
        ringsData={ringsData}
        ringLat={(d: object) => (d as { lat: number }).lat}
        ringLng={(d: object) => (d as { lng: number }).lng}
        ringMaxRadius={(d: object) => (d as { maxR: number }).maxR}
        ringPropagationSpeed={(d: object) => (d as { propagationSpeed: number }).propagationSpeed}
        ringRepeatPeriod={(d: object) => (d as { repeatPeriod: number }).repeatPeriod}
        ringColor={(d: object) => (d as { color: string }).color}
        ringAltitude={0.002}

        // ── Event + static + hazard markers as 3D sprite objects ──
        objectsData={objectMarkers}
        objectLat={(d: object) => (d as GlobeObjectPoint).lat}
        objectLng={(d: object) => (d as GlobeObjectPoint).lng}
        objectAltitude={(d: object) => (d as GlobeObjectPoint).altitude}
        objectThreeObject={(d: object) => {
          const p = d as GlobeObjectPoint;
          const group = new THREE.Group();
          let texture: THREE.CanvasTexture;
          if (p.kind === 'event') {
            texture = getEventMarkerTexture(p.color, (p.severity || 0) >= 7);
          } else if (p.kind === 'static') {
            texture = getInfraMarkerTexture(p.color, p.layerType || 'military');
          } else {
            // hazard
            switch (p.hazardType) {
              case 'earthquake': texture = getEarthquakeTexture(p.color); break;
              case 'weather': texture = getWeatherTexture(p.color); break;
              case 'fire': texture = getFireTexture(p.color); break;
              case 'cyber': texture = getCyberTexture(p.color); break;
              default: texture = getEventMarkerTexture(p.color, false);
            }
          }
          const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
          const sprite = new THREE.Sprite(mat);
          const scale = p.spriteSize * 3.5;
          sprite.scale.set(scale, scale, 1);
          sprite.renderOrder = 3;
          group.add(sprite);
          // Pulsing glow ring for critical events (severity >= 8)
          if ((p.kind === 'event' || p.kind === 'hazard') && (p.severity || 0) >= 8) {
            const glowMat = new THREE.SpriteMaterial({
              map: texture, transparent: true, opacity: 0.25,
              depthWrite: false, depthTest: false,
            });
            const glowSprite = new THREE.Sprite(glowMat);
            const glowScale = scale * 2.0;
            glowSprite.scale.set(glowScale, glowScale, 1);
            glowSprite.renderOrder = 2;
            glowSprite.name = 'pulse-glow';
            group.add(glowSprite);
          }
          group.userData = { markerData: p, birthTime: performance.now() };
          return group;
        }}
        onObjectClick={(d: object, _evt: MouseEvent) => {
          const group = d as THREE.Group;
          const p = group?.userData?.markerData as GlobeObjectPoint | undefined;
          if (!p) return;
          stopAutoRotation();
          if ((p.kind === 'event' || p.kind === 'hazard') && p.eventData) {
            setSelectedTracking(null); setSelectedStatic(null); setSelectedCountry(null);
            setSelectedEvent(p.eventData);
            globeRef.current?.pointOfView({ lat: p.lat, lng: p.lng, altitude: 0.35 }, 1200);
          } else if (p.kind === 'static' && p.staticData) {
            setSelectedEvent(null); setSelectedTracking(null); setSelectedCountry(null);
            setSelectedStatic(p.staticData);
            globeRef.current?.pointOfView({ lat: p.lat, lng: p.lng, altitude: 0.4 }, 1200);
          }
        }}
        onObjectHover={(d: object | null, _prev: object | null) => {
          if (!d) { setHoverTooltip(null); return; }
          const group = d as THREE.Group;
          const p = group?.userData?.markerData as GlobeObjectPoint | undefined;
          if (!p) { setHoverTooltip(null); return; }
          const rect = containerRef.current?.getBoundingClientRect();
          const cx = rect ? rect.left + rect.width / 2 : 400;
          const cy = rect ? rect.top + rect.height / 2 : 300;
          if ((p.kind === 'event' || p.kind === 'hazard') && p.eventData) {
            const ev = p.eventData;
            const sevTag = p.severity ? `SEV${p.severity}` : '';
            const catTag = ev.category ? ev.category.replace(/_/g, ' ') : '';
            const coordTag = `${ev.lat.toFixed(1)}, ${ev.lng.toFixed(1)}`;
            const header = [sevTag, catTag].filter(Boolean).join(' · ');
            const text = `${header}\n${ev.summary?.slice(0, 90) || 'No summary'}\n${coordTag}`;
            setHoverTooltip({ x: cx, y: cy - 60, text, color: p.color });
          } else if (p.kind === 'static' && p.staticData) {
            const lbl = INFRA_LABELS[p.layerType || 'military'] || p.layerType;
            setHoverTooltip({ x: cx, y: cy - 60, text: `${p.staticData.name} · ${p.staticData.country} [${lbl}]`, color: p.color });
          }
        }}

        // ── Tracking overlay ──
        customLayerData={customData}
        customThreeObject={(d: object) => {
          const data = d as TrackingPoint;
          const group = new THREE.Group();
          const spriteScale = data.size * 4.5;

          if (data.type === 'flight') {
            const texture = getAircraftTexture(data.color, !!data.isMilitary);
            const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 1.0, depthWrite: false, depthTest: false });
            // Apply heading rotation (0=North, clockwise). SpriteMaterial.rotation is CCW in radians.
            if (data.heading != null) {
              mat.rotation = -(data.heading * Math.PI) / 180;
            }
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(spriteScale, spriteScale, 1);
            sprite.renderOrder = 2;
            group.add(sprite);
          } else if (data.type === 'vessel') {
            const texture = getVesselTexture(data.color, !!data.is_dark);
            const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
            if (data.heading != null) {
              mat.rotation = -(data.heading * Math.PI) / 180;
            }
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(spriteScale, spriteScale, 1);
            sprite.renderOrder = 2;
            group.add(sprite);
          } else {
            const texture = getWebcamTexture(data.color);
            const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(spriteScale * 0.85, spriteScale * 0.85, 1);
            sprite.renderOrder = 1;
            group.add(sprite);
          }

          group.userData = { trackingData: data };
          return group;
        }}
        customThreeObjectUpdate={(obj: object, d: object) => {
          const group = obj as THREE.Group;
          const data = d as TrackingPoint;
          const coords = globeRef.current?.getCoords(data.lat, data.lng, data.altitude);
          if (coords) {
            group.position.set(coords.x, coords.y, coords.z);
          }
          // Only update rotation when heading has actually changed (skip costly material update per frame)
          if (data.heading != null && (data.type === 'flight' || data.type === 'vessel')) {
            if (group.userData.lastHeading !== data.heading) {
              const sprite = group.children[0] as THREE.Sprite | undefined;
              if (sprite) {
                (sprite.material as THREE.SpriteMaterial).rotation = -(data.heading * Math.PI) / 180;
              }
              group.userData.lastHeading = data.heading;
            }
          }
        }}
        onCustomLayerClick={handleTrackingClick}
        onGlobeClick={handleGlobeClick}
      />

      <GlobeHUD
        mouseCoords={mouseCoords}
        eventCount={globeEvents.length}
        flightCount={flights.length}
        vesselCount={vessels.length}
        webcamCount={webcams.length}
      />

      <GlobeControls flyTo={flyTo} />


      {/* Resume rotation button — only visible when rotation is stopped */}
      {!autoRotating && (
        <button
          onClick={resumeAutoRotation}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 bg-[#060B16]/95 border border-[#FF6D2A]/25 text-[9px] font-mono text-[#FF6D2A] hover:text-[#FF8A50] hover:border-[#FF6D2A]/50 transition-all animate-fade-in group tracking-widest"
          title="Resume auto-rotation"
        >
          <RotateCcw size={12} className="group-hover:animate-spin" />
          <span className="tracking-wider">RESUME ROTATION</span>
        </button>
      )}

      <div className="absolute bottom-14 right-4 z-20">
        <GlobeLegend
          qualityMode={qualityMode}
          viewMode={viewMode}
          onQualityChange={setQualityMode}
          onViewModeChange={setViewMode}
        />
      </div>

      {/* Hover tooltip */}
      {hoverTooltip && (
        <div
          className="pointer-events-none fixed z-50 max-w-[260px] px-2.5 py-2 bg-[#060B16]/98 border text-[9px] font-mono text-[#D0D9E8] shadow-lg transition-none backdrop-blur-sm"
          style={{
            left: hoverTooltip.x + 12,
            top: hoverTooltip.y - 36,
            borderColor: hoverTooltip.color + '50',
            boxShadow: `0 0 16px ${hoverTooltip.color}25`,
          }}
        >
          <div className="h-0.5 w-full rounded mb-1.5" style={{ background: hoverTooltip.color }} />
          {hoverTooltip.text.split('\n').map((line, i) => (
            <div key={i} className={i === 0 ? 'font-bold tracking-wider text-[8px] mb-0.5' : i === 2 ? 'text-[7px] text-[#4E6070] mt-0.5 tabular-nums' : 'leading-tight line-clamp-2'}
              style={i === 0 ? { color: hoverTooltip.color } : undefined}>
              {line}
            </div>
          ))}
        </div>
      )}

      {selectedEvent && <GlobeDetail event={selectedEvent} onClose={closeDetail} />}
      {selectedTracking && <TrackingDetail point={selectedTracking} onClose={closeDetail} />}
      {selectedStatic && <StaticDetail marker={selectedStatic} onClose={closeDetail} />}
      {selectedCountry && <CountryDetail country={selectedCountry} onClose={() => setSelectedCountry(null)} />}
    </div>
  );
}

// ── Tracking Detail Panels ──

function TrackingDetail({ point, onClose }: { point: TrackingPoint; onClose: () => void }) {
  if (point.type === 'flight') return <FlightDetail point={point} onClose={onClose} />;
  if (point.type === 'vessel') return <VesselDetail point={point} onClose={onClose} />;
  return <WebcamDetail point={point} onClose={onClose} />;
}

function FlightDetail({ point, onClose }: { point: TrackingPoint; onClose: () => void }) {
  const isMil = point.isMilitary;
  const isGov = point.is_government;
  const altM = point.flightAltitude || 0;
  const altFt = altM ? Math.round(altM * 3.281).toLocaleString() : '--';
  const altKm = altM ? (altM / 1000).toFixed(1) : '--';
  const spdMs = point.velocity || 0;
  const spdKt = spdMs ? Math.round(spdMs * 1.944) : '--';
  const spdKmh = spdMs ? Math.round(spdMs * 3.6) : '--';
  const hdg = point.heading && point.heading < 360 ? Math.round(point.heading) : null;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const compass = hdg !== null ? dirs[Math.round(hdg / 22.5) % 16] : '';
  const isSquawkAlert = point.squawk && ['7500', '7600', '7700'].includes(point.squawk);
  const squawkMeaning: Record<string, string> = { '7500': 'HIJACK', '7600': 'RADIO FAILURE', '7700': 'EMERGENCY' };
  const accent = isMil ? '#ef4444' : isGov ? '#f59e0b' : '#3b82f6';

  return (
    <div className="absolute bottom-4 right-4 z-30 w-80 animate-slide-in">
      <div className="sonar-detail-panel">
        <div className="h-[3px]" style={{ background: `linear-gradient(to right, ${accent}, transparent)` }} />
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            {isMil && <span className="detail-badge bg-red-500/15 text-red-400 border-red-500/20">MILITARY</span>}
            {isGov && <span className="detail-badge bg-amber-500/15 text-amber-400 border-amber-500/20">GOVERNMENT</span>}
            {!isMil && !isGov && <span className="detail-badge bg-blue-500/15 text-blue-400 border-blue-500/20">CIVILIAN</span>}
            <span className="text-[8px] font-mono text-slate-600 tracking-widest">AIRCRAFT</span>
          </div>
          <DetailCloseBtn onClick={onClose} />
        </div>
        {isSquawkAlert && (
          <div className="mx-4 mt-3 px-3 py-2 bg-red-500/[0.1] border border-red-500/30 rounded-lg flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.7)]" />
            <div>
              <div className="text-[10px] font-mono text-red-400 font-bold tracking-wide">SQUAWK {point.squawk} — {squawkMeaning[point.squawk!] || 'ALERT'}</div>
              <div className="text-[8px] font-mono text-red-400/50 mt-0.5">Emergency transponder code active</div>
            </div>
          </div>
        )}
        <div className="p-4 space-y-3">
          <div>
            <div className="text-[18px] font-mono font-extrabold text-white tracking-wide">{point.callsign || 'UNKNOWN'}</div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              ICAO: <span className="text-slate-400">{point.icao24}</span>
              {point.origin_country ? <> &middot; <span className="text-slate-400">{point.origin_country}</span></> : null}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-lg overflow-hidden bg-white/[0.03]">
            <div className="bg-[#0d1117] p-2.5 text-center">
              <div className="text-[7px] font-mono text-slate-600 tracking-[2px] mb-1">ALTITUDE</div>
              <div className="text-[14px] font-mono font-bold text-white">{altFt}</div>
              <div className="text-[8px] font-mono text-slate-600">ft / {altKm} km</div>
            </div>
            <div className="bg-[#0d1117] p-2.5 text-center">
              <div className="text-[7px] font-mono text-slate-600 tracking-[2px] mb-1">SPEED</div>
              <div className="text-[14px] font-mono font-bold text-white">{spdKt}</div>
              <div className="text-[8px] font-mono text-slate-600">kt / {spdKmh} km/h</div>
            </div>
            <div className="bg-[#0d1117] p-2.5 text-center">
              <div className="text-[7px] font-mono text-slate-600 tracking-[2px] mb-1">HEADING</div>
              <div className="text-[14px] font-mono font-bold text-white">{hdg !== null ? `${hdg}°` : '--'}</div>
              <div className="text-[8px] font-mono text-slate-600">{compass}</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="text-[9px] font-mono text-slate-600">
              SQK: <span className={isSquawkAlert ? 'text-red-400 font-bold' : 'text-slate-400'}>{point.squawk || '----'}</span>
            </div>
            <div className="text-[9px] font-mono text-cyan-400/40 tabular-nums">
              {point.lat.toFixed(4)}°, {point.lng.toFixed(4)}°
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VesselDetail({ point, onClose }: { point: TrackingPoint; onClose: () => void }) {
  const isMil = point.isMilitary;
  const isDark = point.is_dark;
  const accent = isMil ? '#ef4444' : isDark ? '#f97316' : '#3b82f6';

  const vesselTypes: Record<string, string> = {
    '0': 'Unknown', '20': 'Wing in Ground', '30': 'Fishing', '31': 'Towing', '32': 'Towing (large)',
    '33': 'Dredging', '34': 'Diving Ops', '35': 'Military Ops', '36': 'Sailing', '37': 'Pleasure',
    '40': 'High Speed Craft', '50': 'Pilot', '51': 'SAR', '52': 'Tug', '53': 'Port Tender',
    '60': 'Passenger', '70': 'Cargo', '71': 'Cargo (A)', '72': 'Cargo (B)',
    '80': 'Tanker', '81': 'Tanker (A)', '82': 'Tanker (B)', '89': 'Tanker', '90': 'Other',
  };
  const vTypeName = point.vessel_type ? (vesselTypes[String(point.vessel_type)] || `Type ${point.vessel_type}`) : 'Unknown';
  const hdg = point.heading && point.heading < 360 && point.heading !== 511 ? Math.round(point.heading) : null;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const compass = hdg !== null ? dirs[Math.round(hdg / 22.5) % 16] : '';

  return (
    <div className="absolute bottom-4 right-4 z-30 w-80 animate-slide-in">
      <div className="sonar-detail-panel">
        <div className="h-[3px]" style={{ background: `linear-gradient(to right, ${accent}, transparent)` }} />
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            {isMil && <span className="detail-badge bg-red-500/15 text-red-400 border-red-500/20">MILITARY</span>}
            {isDark && <span className="detail-badge bg-orange-500/15 text-orange-400 border-orange-500/20">DARK SHIP</span>}
            {!isMil && !isDark && <span className="detail-badge bg-blue-500/15 text-blue-400 border-blue-500/20">CIVILIAN</span>}
            <span className="text-[8px] font-mono text-slate-600 tracking-widest">VESSEL</span>
          </div>
          <DetailCloseBtn onClick={onClose} />
        </div>
        {isDark && (
          <div className="mx-4 mt-3 px-3 py-2 bg-orange-500/[0.08] border border-orange-500/25 rounded-lg flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
            <div>
              <div className="text-[10px] font-mono text-orange-400 font-bold tracking-wide">AIS TRANSPONDER OFF</div>
              <div className="text-[8px] font-mono text-orange-400/50 mt-0.5">Possible dark ship activity detected</div>
            </div>
          </div>
        )}
        <div className="p-4 space-y-3">
          <div>
            <div className="text-[18px] font-mono font-extrabold text-white tracking-wide">{point.vessel_name || 'UNKNOWN VESSEL'}</div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              MMSI: <span className="text-slate-400">{point.mmsi}</span>
              {point.imo ? <> &middot; IMO: <span className="text-slate-400">{point.imo}</span></> : null}
              {point.flag ? <> &middot; <span className="text-slate-400">{point.flag}</span></> : null}
            </div>
            <div className="text-[9px] font-mono text-slate-600 mt-0.5">{point.vessel_type_name || vTypeName} · Code {point.vessel_type || '--'}</div>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-lg overflow-hidden bg-white/[0.03]">
            <div className="bg-[#0d1117] p-2.5 text-center">
              <div className="text-[7px] font-mono text-slate-600 tracking-[2px] mb-1">SPEED</div>
              <div className="text-[14px] font-mono font-bold text-white">{point.speed ? point.speed.toFixed(1) : '--'}</div>
              <div className="text-[8px] font-mono text-slate-600">knots</div>
            </div>
            <div className="bg-[#0d1117] p-2.5 text-center">
              <div className="text-[7px] font-mono text-slate-600 tracking-[2px] mb-1">HEADING</div>
              <div className="text-[14px] font-mono font-bold text-white">{hdg !== null ? `${hdg}°` : '--'}</div>
              <div className="text-[8px] font-mono text-slate-600">{compass}</div>
            </div>
            <div className="bg-[#0d1117] p-2.5 text-center">
              <div className="text-[7px] font-mono text-slate-600 tracking-[2px] mb-1">AIS TYPE</div>
              <div className="text-[11px] font-mono font-bold text-white truncate">{vTypeName}</div>
              <div className="text-[8px] font-mono text-slate-600">Code {point.vessel_type || '--'}</div>
            </div>
          </div>
          {point.destination && (
            <div className="px-3 py-2.5 bg-blue-500/[0.05] border border-blue-500/15 rounded-lg">
              <div className="text-[7px] font-mono text-slate-600 tracking-[2px] mb-1">DESTINATION</div>
              <div className="text-[13px] font-mono font-semibold text-blue-300">{point.destination}</div>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <div className="text-[9px] font-mono text-cyan-400/40 tabular-nums">
              {point.lat.toFixed(4)}°, {point.lng.toFixed(4)}°
            </div>
            <a
              href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${point.mmsi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[8px] font-mono text-slate-600 hover:text-slate-400 transition-colors"
            >
              MarineTraffic →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function WebcamDetail({ point, onClose }: { point: TrackingPoint; onClose: () => void }) {
  const hasStream = point.player_url && point.player_url !== '';

  return (
    <div className="absolute bottom-4 right-4 z-30 w-80 animate-slide-in">
      <div className="sonar-detail-panel">
        <div className="h-0.5" style={{ background: 'linear-gradient(to right, #06b6d4, transparent)' }} />
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="detail-badge bg-cyan-500/15 text-cyan-400 border-cyan-500/20">WEBCAM</span>
            {hasStream && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                <span className="text-[8px] font-mono text-green-400">LIVE</span>
              </span>
            )}
          </div>
          <DetailCloseBtn onClick={onClose} />
        </div>

        {point.thumbnail ? (
          <div className="border-b border-white/[0.06] relative">
            <img src={point.thumbnail} className="w-full h-auto" alt={point.label} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            {hasStream && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <a
                  href={point.player_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg transition-all"
                >
                  <div className="w-4 h-4 rounded-full bg-red-500/30 flex items-center justify-center">
                    <div className="w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-white ml-0.5" />
                  </div>
                  <span className="text-[9px] font-mono font-bold text-white tracking-wider">OPEN STREAM</span>
                </a>
              </div>
            )}
          </div>
        ) : null}

        <div className="p-4 space-y-2">
          <div className="text-[13px] font-mono font-semibold text-white">{point.label}</div>
          <div className="text-[10px] font-mono text-slate-500">
            {[point.webcam_city, point.webcam_country].filter(Boolean).join(', ')}
          </div>
          {hasStream && (
            <a href={point.player_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors">
              Open Full Stream <span className="text-sm">→</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function StaticDetail({ marker, onClose }: { marker: StaticMarker; onClose: () => void }) {
  const accent = INFRA_COLORS[marker.layerType] || '#f59e0b';
  const label = INFRA_LABELS[marker.layerType] || String(marker.layerType || '').toUpperCase();
  const riskColor = (r: string) => {
    const rl = String(r).toLowerCase();
    return rl === 'critical' ? '#dc2626' : rl === 'high' ? '#ef4444' : rl === 'medium' ? '#f59e0b' : '#10b981';
  };

  return (
    <div className="absolute bottom-4 right-4 z-30 w-80 max-h-[80vh] overflow-y-auto animate-slide-in scrollbar-thin scrollbar-thumb-white/10">
      <div className="sonar-detail-panel">
        <div className="h-0.5" style={{ background: `linear-gradient(to right, ${accent}, transparent)` }} />
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="detail-badge" style={{ background: `${accent}15`, color: accent, borderColor: `${accent}30` }}>
              {label}
            </span>
            {marker.status && marker.status !== 'operational' && (
              <span className="detail-badge" style={{
                background: marker.status === 'damaged' || marker.status === 'at risk' ? '#ef444415' : '#f59e0b15',
                color: marker.status === 'damaged' || marker.status === 'at risk' ? '#ef4444' : '#f59e0b',
                borderColor: marker.status === 'damaged' || marker.status === 'at risk' ? '#ef444430' : '#f59e0b30',
              }}>
                {String(marker.status).toUpperCase()}
              </span>
            )}
          </div>
          <DetailCloseBtn onClick={onClose} />
        </div>
        <div className="p-4 space-y-3">
          <div>
            <div className="text-[15px] font-mono font-bold text-white tracking-wide">{marker.name}</div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">{marker.country}</div>
          </div>
          <div className="detail-grid">
            <DataCell label="TYPE" value={marker.type || '--'} color={accent} />
            {marker.branch && <DataCell label="BRANCH" value={marker.branch} color={accent} />}
            {marker.operator && <DataCell label="OPERATOR" value={marker.operator} color={accent} />}
            {marker.capacity && <DataCell label="CAPACITY" value={marker.capacity} color={accent} />}
            {marker.status && <DataCell label="STATUS" value={String(marker.status).toUpperCase()} color={accent} />}
            {marker.risk && (
              <DataCell label="RISK LEVEL" value={String(marker.risk).toUpperCase()} color={riskColor(String(marker.risk))} />
            )}
          </div>
          {marker.strategic && (
            <div className="px-2.5 py-2 bg-white/[0.03] border border-white/[0.06] rounded-md">
              <div className="text-[7px] font-mono text-slate-600 tracking-[1.5px] mb-1">STRATEGIC IMPORTANCE</div>
              <div className="text-[10px] font-mono text-slate-300 leading-relaxed">{marker.strategic}</div>
            </div>
          )}
          <div className="text-[9px] font-mono text-cyan-400/50 tabular-nums">
            {marker.lat.toFixed(4)}°, {marker.lng.toFixed(4)}°
          </div>
        </div>
      </div>
    </div>
  );
}

function CountryDetail({ country, onClose }: {
  country: { name: string; events: GlobeEvent[]; severity: number; count: number };
  onClose: () => void;
}) {
  const flights = useTrackingStore(s => s.flights);
  const vessels = useTrackingStore(s => s.vessels);

  const sevColor = country.severity >= 9 ? '#dc2626' : country.severity >= 7 ? '#ef4444' : country.severity >= 5 ? '#f59e0b' : country.severity >= 3 ? '#10b981' : '#06b6d4';
  const sevLabel = country.severity >= 9 ? 'CRITICAL' : country.severity >= 7 ? 'HIGH' : country.severity >= 5 ? 'MEDIUM' : country.severity >= 3 ? 'LOW' : 'STABLE';
  const nameUpper = String(country.name).toUpperCase();

  const matchName = useCallback((val: string) => {
    if (!val) return false;
    const v = String(val).toUpperCase().trim();
    // Exact match only — no substring matching to avoid "US" matching "RUSSIA" etc.
    return v === nameUpper;
  }, [nameUpper]);

  // Tracking data for this country
  const countryFlights = useMemo(() => flights.filter(f => matchName(f.origin_country || '')), [flights, matchName]);
  const countryVessels = useMemo(() => vessels.filter(v => matchName(v.flag || '')), [vessels, matchName]);
  const milFlights = countryFlights.filter(f => f.is_military).length;
  const govFlights = countryFlights.filter(f => f.is_government).length;
  const milVessels = countryVessels.filter(v => v.is_military).length;
  const darkShips = countryVessels.filter(v => v.is_dark).length;

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of country.events) {
      counts[e.category || 'UNKNOWN'] = (counts[e.category || 'UNKNOWN'] || 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 6);
  }, [country.events]);

  // Source breakdown
  const sourceBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of country.events) {
      counts[e.source || 'unknown'] = (counts[e.source || 'unknown'] || 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 5);
  }, [country.events]);

  // Severity distribution
  const sevDist = useMemo(() => {
    const d = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const e of country.events) {
      if (e.severity >= 9) d.critical++;
      else if (e.severity >= 7) d.high++;
      else if (e.severity >= 5) d.medium++;
      else d.low++;
    }
    return d;
  }, [country.events]);

  const avgImpact = country.events.length > 0
    ? (country.events.reduce((sum, e) => sum + (e.impact_score || 0), 0) / country.events.length).toFixed(1)
    : '0.0';

  return (
    <div className="absolute bottom-4 right-4 z-30 w-[340px] max-h-[85vh] overflow-y-auto animate-slide-in scrollbar-thin scrollbar-thumb-white/10">
      <div className="sonar-detail-panel">
        <div className="h-[3px]" style={{ background: `linear-gradient(to right, ${sevColor}, transparent)` }} />
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="detail-badge" style={{ background: `${sevColor}15`, color: sevColor, borderColor: `${sevColor}30` }}>
              {sevLabel}
            </span>
            <span className="text-[8px] font-mono text-slate-600 tracking-widest">COUNTRY INTEL</span>
          </div>
          <DetailCloseBtn onClick={onClose} />
        </div>
        <div className="p-4 space-y-3">
          {/* Header */}
          <div>
            <div className="text-[18px] font-mono font-extrabold text-white tracking-wide">{country.name}</div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              {country.count} {country.count === 1 ? 'event' : 'events'} in last 48h &middot; Avg impact: <span className="text-slate-400">{avgImpact}</span>
            </div>
          </div>

          {/* Threat level bar */}
          <div className="px-3 py-2.5 rounded-lg" style={{ background: `${sevColor}08`, border: `1px solid ${sevColor}20` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8px] font-mono text-slate-500 tracking-[2px]">THREAT LEVEL</span>
              <span className="text-[12px] font-mono font-bold" style={{ color: sevColor }}>{country.severity}/10</span>
            </div>
            <div className="h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${country.severity * 10}%`, background: sevColor }} />
            </div>
          </div>

          {/* Severity distribution */}
          {country.count > 0 && (
            <div className="grid grid-cols-4 gap-[1px] rounded-lg overflow-hidden bg-white/[0.03]">
              <div className="bg-[#0d1117] p-2 text-center">
                <div className="text-[7px] font-mono text-slate-600 tracking-[1px] mb-0.5">CRITICAL</div>
                <div className="text-[14px] font-mono font-bold text-red-500">{sevDist.critical}</div>
              </div>
              <div className="bg-[#0d1117] p-2 text-center">
                <div className="text-[7px] font-mono text-slate-600 tracking-[1px] mb-0.5">HIGH</div>
                <div className="text-[14px] font-mono font-bold text-red-400">{sevDist.high}</div>
              </div>
              <div className="bg-[#0d1117] p-2 text-center">
                <div className="text-[7px] font-mono text-slate-600 tracking-[1px] mb-0.5">MEDIUM</div>
                <div className="text-[14px] font-mono font-bold text-amber-400">{sevDist.medium}</div>
              </div>
              <div className="bg-[#0d1117] p-2 text-center">
                <div className="text-[7px] font-mono text-slate-600 tracking-[1px] mb-0.5">LOW</div>
                <div className="text-[14px] font-mono font-bold text-emerald-400">{sevDist.low}</div>
              </div>
            </div>
          )}

          {/* Tracking overview */}
          {(countryFlights.length > 0 || countryVessels.length > 0) && (
            <div>
              <div className="text-[8px] font-mono text-slate-600 tracking-[2px] mb-2">TRACKING ACTIVITY</div>
              <div className="grid grid-cols-2 gap-2">
                {countryFlights.length > 0 && (
                  <div className="px-2.5 py-2 rounded-lg bg-[#0d1117] border border-white/[0.04]">
                    <div className="text-[7px] font-mono text-slate-600 tracking-[1px] mb-1">AIRCRAFT</div>
                    <div className="text-[16px] font-mono font-bold text-slate-200">{countryFlights.length}</div>
                    <div className="mt-1 space-y-0.5">
                      {milFlights > 0 && <div className="text-[8px] font-mono text-red-400">{milFlights} military</div>}
                      {govFlights > 0 && <div className="text-[8px] font-mono text-amber-400">{govFlights} government</div>}
                      {countryFlights.length - milFlights - govFlights > 0 && (
                        <div className="text-[8px] font-mono text-slate-500">{countryFlights.length - milFlights - govFlights} civilian</div>
                      )}
                    </div>
                  </div>
                )}
                {countryVessels.length > 0 && (
                  <div className="px-2.5 py-2 rounded-lg bg-[#0d1117] border border-white/[0.04]">
                    <div className="text-[7px] font-mono text-slate-600 tracking-[1px] mb-1">VESSELS</div>
                    <div className="text-[16px] font-mono font-bold text-slate-200">{countryVessels.length}</div>
                    <div className="mt-1 space-y-0.5">
                      {milVessels > 0 && <div className="text-[8px] font-mono text-red-400">{milVessels} military</div>}
                      {darkShips > 0 && <div className="text-[8px] font-mono text-orange-400">{darkShips} dark ships</div>}
                      {countryVessels.length - milVessels - darkShips > 0 && (
                        <div className="text-[8px] font-mono text-slate-500">{countryVessels.length - milVessels - darkShips} civilian</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          {categoryBreakdown.length > 0 && (
            <div>
              <div className="text-[8px] font-mono text-slate-600 tracking-[2px] mb-2">THREAT CATEGORIES</div>
              <div className="space-y-1">
                {categoryBreakdown.map(([cat, cnt]) => {
                  const catColor = CATEGORY_COLORS[cat] || '#06b6d4';
                  const pct = country.count > 0 ? (cnt / country.count) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center gap-2 py-0.5">
                      <span className="text-[9px] font-mono text-slate-400 tracking-wider flex-1 truncate">
                        {(CATEGORY_EMOJIS[cat] || '') + ' ' + cat.replace(/_/g, ' ')}
                      </span>
                      <div className="w-16 h-1 bg-[#1a1f2e] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: catColor }} />
                      </div>
                      <span className="text-[9px] font-mono text-slate-300 font-bold tabular-nums w-5 text-right">{cnt}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Source breakdown */}
          {sourceBreakdown.length > 0 && (
            <div>
              <div className="text-[8px] font-mono text-slate-600 tracking-[2px] mb-2">INTEL SOURCES</div>
              <div className="flex flex-wrap gap-1.5">
                {sourceBreakdown.map(([src, cnt]) => (
                  <span key={src} className="px-2 py-0.5 bg-cyan-500/[0.06] border border-cyan-500/15 rounded text-[8px] font-mono text-cyan-400/80">
                    {src} <span className="text-cyan-400/50">{cnt}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent events */}
          {country.events.length > 0 && (
            <div>
              <div className="text-[8px] font-mono text-slate-600 tracking-[2px] mb-2">LATEST EVENTS</div>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {country.events.map((ev) => {
                  const evColor = ev.severity >= 9 ? '#dc2626' : ev.severity >= 7 ? '#ef4444' : ev.severity >= 5 ? '#f59e0b' : '#10b981';
                  return (
                    <div key={ev.id} className="flex items-start gap-2 py-1.5 border-l-2 pl-2" style={{ borderLeftColor: evColor }}>
                      <span className="text-[8px] font-mono font-bold px-1 py-0.5 rounded shrink-0" style={{ color: evColor, background: `${evColor}15` }}>
                        {ev.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{ev.summary}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[7px] font-mono text-slate-600">{ev.source}</span>
                          {ev.impact_score ? <span className="text-[7px] font-mono text-cyan-400/50">impact: {ev.impact_score.toFixed(1)}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {country.count === 0 && (
            <div className="text-center py-4">
              <div className="text-[10px] font-mono text-slate-600">No events detected</div>
              <div className="text-[9px] font-mono text-emerald-500/60 mt-1">STABLE</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailCloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-slate-500 hover:text-white transition-colors p-1 hover:bg-white/[0.05] rounded">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  );
}

function DataCell({ label, value, color = '#06b6d4' }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center py-1">
      <div className="text-[7px] font-mono tracking-widest mb-0.5" style={{ color: `${color}66` }}>{label}</div>
      <div className="text-[12px] font-mono text-slate-200 font-semibold truncate">{value}</div>
    </div>
  );
}

