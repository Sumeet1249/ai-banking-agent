'use client'

import React from 'react'
import { Shield, ShieldAlert, ShieldCheck, AlertTriangle, TrendingUp, TrendingDown, Activity, Clock, Zap, Target } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RiskSeverity = 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL'

export interface RiskVectorBreakdown {
  intent_drift: number // 0-100
  velocity_burst: number // 0-100
  identity_integrity: number // 0-100
  off_hours: number // 0-100
  blast_radius_paise?: number
}

export interface VitalRiskData {
  score: number // 0-100
  severity?: RiskSeverity
  trend?: 'ACCELERATING' | 'STABLE' | 'IMPROVING'
  trend_delta?: number
  early_warning_advisory?: string
  vectors?: RiskVectorBreakdown
}

export function getRiskSeverity(score: number): RiskSeverity {
  if (score >= 76) return 'CRITICAL'
  if (score >= 51) return 'HIGH'
  if (score >= 26) return 'ELEVATED'
  return 'LOW'
}

export function getSeverityTheme(severity: RiskSeverity) {
  switch (severity) {
    case 'CRITICAL':
      return {
        text: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        glow: 'shadow-[0_0_15px_rgba(244,63,94,0.25)]',
        stroke: '#f43f5e',
        label: 'CRITICAL RISK',
      }
    case 'HIGH':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]',
        stroke: '#f59e0b',
        label: 'HIGH RISK',
      }
    case 'ELEVATED':
      return {
        text: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        glow: 'shadow-[0_0_15px_rgba(59,130,246,0.15)]',
        stroke: '#3b82f6',
        label: 'ELEVATED',
      }
    case 'LOW':
    default:
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
        stroke: '#10b981',
        label: 'OPTIMAL',
      }
  }
}

/**
 * Compact Risk Score Badge for Tables & Lists
 */
export function VitalRiskBadge({ score, className }: { score: number; className?: string }) {
  const severity = getRiskSeverity(score)
  const theme = getSeverityTheme(severity)

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold transition-all',
        theme.bg,
        theme.text,
        theme.border,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', severity === 'CRITICAL' ? 'bg-rose-400 animate-pulse' : theme.text.replace('text-', 'bg-'))} />
      <span>{score}</span>
      <span className="text-[8px] opacity-75 font-sans font-medium uppercase">{severity}</span>
    </div>
  )
}

/**
 * Interactive SVG Radial Gauge for Vital Risk Score
 */
export function VitalRiskGauge({ score, size = 120 }: { score: number; size?: number }) {
  const severity = getRiskSeverity(score)
  const theme = getSeverityTheme(severity)

  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // Arc covers 260 degrees (leaving bottom gap for scannability)
  const arcLength = circumference * (260 / 360)
  const strokeDashoffset = arcLength - (arcLength * Math.min(100, Math.max(0, score))) / 100

  return (
    <div className="relative inline-flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform rotate-[140deg] overflow-visible">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Dynamic risk score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>

      {/* Central Score Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pt-1">
        <span className={cn('text-2xl font-bold font-mono tracking-tight', theme.text)}>{score}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">/ 100</span>
      </div>
    </div>
  )
}

/**
 * Full Vital Risk Intelligence Card with Early Warning Radar
 */
export function VitalRiskCard({ data, className }: { data: VitalRiskData; className?: string }) {
  const severity = data.severity || getRiskSeverity(data.score)
  const theme = getSeverityTheme(severity)

  const vectors: RiskVectorBreakdown = data.vectors || {
    intent_drift: Math.min(100, Math.round(data.score * 0.9)),
    velocity_burst: Math.min(100, Math.round(data.score * 0.6)),
    identity_integrity: Math.max(5, Math.round((100 - data.score) * 0.2)),
    off_hours: data.score > 60 ? 70 : 0,
    blast_radius_paise: 500000,
  }

  return (
    <div
      className={cn(
        'p-5 rounded-xl border bg-card/60 backdrop-blur-sm space-y-4 transition-all',
        theme.border,
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Vital Risk Score & Threat Forecast
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-bold font-mono border',
                theme.bg,
                theme.text,
                theme.border
              )}
            >
              {theme.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time composite telemetry assessing drift velocity, execution blast radius, and baseline deviation.
          </p>
        </div>

        {data.trend && (
          <div className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded bg-secondary/50 text-muted-foreground shrink-0">
            {data.trend === 'ACCELERATING' ? (
              <span className="text-rose-400 flex items-center gap-0.5">
                <TrendingUp className="h-3.5 w-3.5" /> +{data.trend_delta || 14}%
              </span>
            ) : data.trend === 'IMPROVING' ? (
              <span className="text-emerald-400 flex items-center gap-0.5">
                <TrendingDown className="h-3.5 w-3.5" /> -{data.trend_delta || 8}%
              </span>
            ) : (
              <span className="text-muted-foreground">Stable</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center pt-1">
        {/* Gauge Col */}
        <div className="md:col-span-4 flex flex-col items-center justify-center p-3 rounded-xl bg-secondary/30 border border-border/40">
          <VitalRiskGauge score={data.score} size={110} />
          <div className="text-center mt-2">
            <span className={cn('text-xs font-bold font-mono', theme.text)}>{theme.label}</span>
            <p className="text-[10px] text-muted-foreground">Deterministic Evaluation</p>
          </div>
        </div>

        {/* Breakdown Vector Bars Col */}
        <div className="md:col-span-8 space-y-2.5 text-xs">
          {/* 1. Intent Drift Risk */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-foreground flex items-center gap-1.5 font-medium">
                <Target className="h-3 w-3 text-amber-400" /> Intent Drift Velocity
              </span>
              <span className="font-mono text-muted-foreground">{vectors.intent_drift}%</span>
            </div>
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${vectors.intent_drift}%` }}
              />
            </div>
          </div>

          {/* 2. Call Velocity & Burst Intensity */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-foreground flex items-center gap-1.5 font-medium">
                <Zap className="h-3 w-3 text-blue-400" /> Velocity & Burst Burst Risk
              </span>
              <span className="font-mono text-muted-foreground">{vectors.velocity_burst}%</span>
            </div>
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${vectors.velocity_burst}%` }}
              />
            </div>
          </div>

          {/* 3. Temporal / Unusual Hours */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-foreground flex items-center gap-1.5 font-medium">
                <Clock className="h-3 w-3 text-purple-400" /> Off-Hours Temporal Risk (IST)
              </span>
              <span className="font-mono text-muted-foreground">{vectors.off_hours}%</span>
            </div>
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-400 rounded-full transition-all duration-500"
                style={{ width: `${vectors.off_hours}%` }}
              />
            </div>
          </div>

          {/* 4. Identity & Nonce Integrity */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-foreground flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-3 w-3 text-emerald-400" /> Signature & Identity Health
              </span>
              <span className="font-mono text-muted-foreground">{100 - vectors.identity_integrity}%</span>
            </div>
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${100 - vectors.identity_integrity}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Early Warning Advisory Box ("in advance way") */}
      <div className="p-3 rounded-lg bg-secondary/50 border border-border/50 flex items-start gap-2.5 text-xs">
        <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5', theme.text)} />
        <div className="space-y-0.5">
          <span className="font-semibold text-foreground">Early Threat Advisory (Predictive Warning)</span>
          <p className="text-muted-foreground text-[11px]">
            {data.early_warning_advisory ||
              (data.score < 30
                ? 'Fleet behaviour is within nominal baseline bounds. No anomalous drift predicted in next 60 minutes.'
                : data.score < 70
                ? 'Intent divergence trajectory indicates potential mandate parameter drift. Biometric step-up approval will be required for subsequent payment invocations.'
                : 'CRITICAL EARLY WARNING: Rapid violation escalation detected. Automated circuit breaker will quarantine target agent upon next security denial.')}
          </p>
        </div>
      </div>
    </div>
  )
}
