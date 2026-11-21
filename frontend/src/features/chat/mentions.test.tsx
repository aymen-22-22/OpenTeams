import { render } from '@testing-library/react'

import { mentionQuery, renderMentions } from './mentions'

test('detects the @word being typed before the caret', () => {
  expect(mentionQuery('Bonjour @Am', 11)).toEqual({ start: 8, query: 'Am' })
  expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' })
  expect(mentionQuery('mail x@y', 8)).toBeNull() // not after a space
  expect(mentionQuery('@Amina Benali done', 18)).toBeNull()
})

test('highlights mentions, mine stand out', () => {
  const { container } = render(<p>{renderMentions('Salut @Amina Benali et @Lucas, @channel !', ['Amina Benali', 'Lucas'], 'Lucas')}</p>)
  const chips = [...container.querySelectorAll('span')].map((s) => [s.textContent, s.className.includes('bg-amber-200')])
  expect(chips).toEqual([['@Amina Benali', false], ['@Lucas', true], ['@channel', true]])
  expect(container.textContent).toBe('Salut @Amina Benali et @Lucas, @channel !')
})
