import { textDirection } from './utils'

test('text direction comes from the first strong character', () => {
  expect(textDirection('Revue de la maquette')).toBe('ltr')
  expect(textDirection('مراجعة التصميم')).toBe('rtl')
  expect(textDirection('2026 — مراجعة')).toBe('rtl')
  expect(textDirection('123')).toBe('ltr')
})
