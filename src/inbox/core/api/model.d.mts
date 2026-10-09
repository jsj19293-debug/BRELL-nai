/* eslint-disable @typescript-eslint/no-explicit-any */
export const PLATFORMS: string[]
export function normalize(platform: string, body: unknown, options?: unknown): any
export function notification(platform: string, raw: any, options?: any): { item: any; issue: any }
export function classify(platform: string, raw: any): { event: string; type: string; evidence: string }
export function refineNotification(source: any): any
export function refineNotifications(items: any[]): any[]
export function workLink(platform: string, id: unknown): string | null
export function firestoreValue(value: unknown): any
export function instant(value: unknown): string | null
export function https(value: unknown): string | null
export function list(body: unknown): any[] | null
