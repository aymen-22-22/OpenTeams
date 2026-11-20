import { task } from '@/test/mockApi'

import type { Task } from './api'
import { dropTarget } from './KanbanBoard'

const tasks = [
  task('a', 'A', 'pending'),
  task('b', 'B', 'pending'),
  task('c', 'C', 'pending'),
  task('x', 'X', 'in_progress'),
] as Task[]

test('dropping on an empty area of a column appends at the end', () => {
  expect(dropTarget(tasks, 'a', 'finished')).toEqual({ status: 'finished', after_id: null })
  expect(dropTarget(tasks, 'a', 'in_progress')).toEqual({ status: 'in_progress', after_id: 'x' })
})

test('moving down inside a column goes after the target', () => {
  expect(dropTarget(tasks, 'a', 'c')).toEqual({ status: 'pending', after_id: 'c' })
})

test('moving up inside a column goes before the target', () => {
  expect(dropTarget(tasks, 'c', 'a')).toEqual({ status: 'pending', after_id: null })
  expect(dropTarget(tasks, 'c', 'b')).toEqual({ status: 'pending', after_id: 'a' })
})

test('dropping on a task in another column takes its place', () => {
  expect(dropTarget(tasks, 'x', 'b')).toEqual({ status: 'pending', after_id: 'a' })
})

test('unknown targets are ignored', () => {
  expect(dropTarget(tasks, 'a', 'nowhere')).toBeNull()
})
