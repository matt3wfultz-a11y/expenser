const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function money(n: number): string {
  return usd.format(n)
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? word : many}`
}
