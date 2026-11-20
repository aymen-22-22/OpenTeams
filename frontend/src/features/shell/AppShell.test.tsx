import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import i18n from '@/i18n'

import { AppShell } from './AppShell'

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

test('renders the shell in French by default', () => {
  render(<AppShell />)
  expect(screen.getByRole('tab', { name: 'Son IA' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Fichiers' })).toBeInTheDocument()
  expect(document.documentElement.dir).toBe('ltr')
})

test('switching to Arabic sets right-to-left direction', async () => {
  render(<AppShell />)
  await userEvent.selectOptions(screen.getByLabelText('Langue'), 'ar')
  expect(document.documentElement.dir).toBe('rtl')
  expect(document.documentElement.lang).toBe('ar')
  expect(screen.getByRole('tab', { name: 'المهام' })).toBeInTheDocument()
})

test('switching to English translates tabs', async () => {
  render(<AppShell />)
  await userEvent.selectOptions(screen.getByLabelText('Langue'), 'en')
  expect(screen.getByRole('tab', { name: 'His AI' })).toBeInTheDocument()
  expect(document.documentElement.dir).toBe('ltr')
})

test('file tiles show icons only, with the name as accessible label', async () => {
  render(<AppShell />)
  await userEvent.click(screen.getByRole('tab', { name: 'Fichiers' }))
  expect(screen.getAllByRole('button', { name: 'budget.xlsx' }).length).toBeGreaterThan(0)
  expect(screen.queryByText('budget.xlsx')).not.toBeInTheDocument()
})
