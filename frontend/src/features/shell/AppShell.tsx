import { Info, MessageSquare, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AssistantView } from '@/features/ai/AssistantView'
import { CalendarView } from '@/features/calendar/CalendarView'
import { useChannels } from '@/features/channels/api'
import { BrowseChannels } from '@/features/channels/BrowseChannels'
import { ChannelForm } from '@/features/channels/ChannelForm'
import { ChannelView } from '@/features/channels/ChannelView'
import { MeetingForm } from '@/features/calendar/MeetingForm'
import { usePeople, type User } from '@/features/auth/api'
import { useConversations, useDirectConversation, type Message } from '@/features/chat/api'
import type { ReminderInput } from '@/features/notifications/api'
import { PreferencesView } from '@/features/notifications/PreferencesView'
import { PlaybooksView } from '@/features/playbooks/PlaybooksView'
import { ProjectsView } from '@/features/projects/ProjectsView'
import { RequestsView } from '@/features/requests/RequestsView'
import { DashboardView } from '@/features/dashboard/DashboardView'
import { ReportView } from '@/features/playbooks/ReportView'
import { ReminderForm } from '@/features/notifications/ReminderForm'
import type { Task, TaskInput } from '@/features/tasks/api'
import { MyTasks } from '@/features/tasks/MyTasks'
import { TaskForm } from '@/features/tasks/TaskForm'
import { TaskView } from '@/features/tasks/TaskView'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

import { ConversationArea, type ConversationTab } from './ConversationArea'
import { PeoplePanel, type Page } from './PeoplePanel'
import { SidePanel } from './SidePanel'
import { TopBar } from './TopBar'

type Column = 'people' | 'conversation' | 'details'
type View = { kind: 'person' } | { kind: 'myTasks' } | { kind: 'assistant' } | { kind: 'preferences' }
  | { kind: 'playbooks' }
  | { kind: 'calendar' }
  | { kind: 'requests' }
  | { kind: 'projects'; projectId?: string }
  | { kind: 'dashboard' }
  | { kind: 'channel'; channelId: string }
  | { kind: 'channels' }
  | { kind: 'report'; runId: string } | { kind: 'task'; taskId: string }

const NAV = [
  { id: 'people', Icon: Users },
  { id: 'conversation', Icon: MessageSquare },
  { id: 'details', Icon: Info },
] as const

/** Three columns on desktop; one column at a time with bottom navigation on mobile. */
export function AppShell({ me }: { me: User }) {
  const { t } = useTranslation()
  const allPeople = usePeople().data
  const conversations = useConversations().data
  const [selectedId, setSelectedId] = useState<string>()
  const [column, setColumn] = useState<Column>('conversation')
  const [view, setView] = useState<View>({ kind: 'person' })
  const [tab, setTab] = useState<ConversationTab>('chat')
  const [taskDraft, setTaskDraft] = useState<Partial<TaskInput> | null>(null)
  const channels = useChannels().data ?? []
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [meetingChat, setMeetingChat] = useState<string | null>(null)
  const [reminderDraft, setReminderDraft] = useState<Partial<ReminderInput> | null>(null)
  // A deep link from an email (e.g. /tasks/<id>), opened once the data is loaded.
  const [pendingLink, setPendingLink] = useState(() => (location.pathname !== '/' ? location.pathname : null))

  const peopleById = useMemo(() => new Map((allPeople ?? []).map((p) => [p.id, p])), [allPeople])
  const people = (allPeople ?? []).filter((p) => p.id !== me.id)
  const person = people.find((p) => p.id === selectedId) ?? people[0]
  const conversation = useDirectConversation(person?.id).data

  // Unread count per person, from their direct conversation with me.
  const unread = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of conversations ?? []) {
      const other = c.type === 'direct' ? c.member_ids.find((id) => id !== me.id) : undefined
      if (other && other !== person?.id) map.set(other, c.unread_count)
      if (c.type === 'channel') map.set(c.id, c.unread_count) // channel badges are keyed by channel id
    }
    return map
  }, [conversations, me.id, person?.id])

  const showPerson = (id: string, nextTab: ConversationTab = 'chat') => {
    setSelectedId(id)
    setTab(nextTab)
    setView({ kind: 'person' })
    setColumn('conversation')
  }

  const openTask = (task: Pick<Task, 'id'>) => {
    setView({ kind: 'task', taskId: task.id })
    setColumn('conversation')
  }

  const show = (next: View) => {
    setView(next)
    setColumn('conversation')
  }

  /** Open a conversation: a direct chat shows the person, a task chat shows its task. */
  const openConversation = async (conversationId: string) => {
    const c = conversations?.find((x) => x.id === conversationId)
    if (c?.type === 'channel') {
      show({ kind: 'channel', channelId: c.id })
      return
    }
    if (c?.type === 'direct') {
      const other = c.member_ids.find((id) => id !== me.id)
      if (other) showPerson(other)
      return
    }
    const task = (await api<Task[]>('/tasks')).find((x) => x.conversation_id === conversationId)
    if (task) openTask(task)
  }

  /** In-app links used by notifications and emails. */
  const navigate = (link: string) => {
    const [, kind, id] = link.split('/')
    if (kind === 'tasks' && id) openTask({ id })
    else if (kind === 'conversations' && id) void openConversation(id)
    else if (kind === 'reports' && id) show({ kind: 'report', runId: id })
    else if (kind === 'playbooks') show({ kind: 'playbooks' })
    else if (kind === 'calendar') show({ kind: 'calendar' })
    else if (kind === 'requests') show({ kind: 'requests' })
    else if (kind === 'projects') show({ kind: 'projects', projectId: id })
    else if (kind === 'dashboard') show({ kind: 'dashboard' })
    else if (kind === 'preferences') show({ kind: 'preferences' })
  }

  useEffect(() => {
    if (!pendingLink || !conversations) return
    history.replaceState(null, '', '/')
    setPendingLink(null) // eslint-disable-line react-hooks/set-state-in-effect -- one-time deep link
    navigate(pendingLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate uses the loaded conversations
  }, [pendingLink, conversations])

  return (
    <div className="flex h-dvh flex-col">
      <TopBar me={me} onOpenMessage={(m: Message) => void openConversation(m.conversation_id)} onNavigate={navigate} />
      <main className="flex flex-1 overflow-hidden">
        <div className={cn(column === 'people' ? 'flex' : 'hidden', 'w-full flex-col overflow-y-auto border-e border-border md:flex md:w-72')}>
          <PeoplePanel
            people={people}
            unread={unread}
            selectedId={view.kind === 'person' ? person?.id : undefined}
            onSelect={(p) => showPerson(p.id)}
            isManager={me.role !== 'employee'}
            channels={channels}
            selectedChannelId={view.kind === 'channel' ? view.channelId : undefined}
            onOpenChannel={(id) => show({ kind: 'channel', channelId: id })}
            onBrowseChannels={() => show({ kind: 'channels' })}
            onOpen={(page: Page) => show({ kind: page })}
          />
        </div>
        <div className={cn(column === 'conversation' ? 'flex' : 'hidden', 'min-w-0 flex-1 flex-col md:flex')}>
          {view.kind === 'task' && (
            <TaskView key={view.taskId} taskId={view.taskId} meId={me.id} people={peopleById} onBack={() => setView({ kind: 'person' })}
              onRemind={(id, title) => setReminderDraft({ title, target_type: 'task', target_id: id })} />
          )}
          {view.kind === 'assistant' && <AssistantView me={me} people={peopleById} />}
          {view.kind === 'preferences' && <PreferencesView />}
          {view.kind === 'calendar' && (
            <CalendarView me={me} people={peopleById} onOpenTask={(id) => openTask({ id })}
              onOpenProject={(id) => show({ kind: 'projects', projectId: id })}
              onRemind={(e) => setReminderDraft({ title: e.title, target_type: 'event', target_id: e.id })} />
          )}
          {view.kind === 'channel' && (
            <ChannelView key={view.channelId} channelId={view.channelId} meId={me.id} people={peopleById}
              onCreateTask={(m) => setTaskDraft({ title: m.body.slice(0, 200), source_message_id: m.id })}
              onRemind={(m) => setReminderDraft({ title: m.body.slice(0, 200), target_type: 'message', target_id: m.id })} />
          )}
          {view.kind === 'channels' && (
            <BrowseChannels onOpen={(id) => show({ kind: 'channel', channelId: id })} onNew={() => setCreatingChannel(true)} />
          )}
          {view.kind === 'requests' && <RequestsView me={me} people={peopleById} />}
          {view.kind === 'projects' && (
            <ProjectsView key={view.projectId ?? 'list'} me={me} people={peopleById} initialId={view.projectId}
              onOpenTask={openTask} onNewTask={(projectId) => setTaskDraft({ project_id: projectId })} />
          )}
          {view.kind === 'dashboard' && <DashboardView onOpenTask={(id) => openTask({ id })} />}
          {view.kind === 'playbooks' && (
            <PlaybooksView me={me} people={peopleById} onOpenRun={(runId) => show({ kind: 'report', runId })} />
          )}
          {view.kind === 'report' && <ReportView key={view.runId} runId={view.runId} people={peopleById} />}
          {view.kind === 'myTasks' && (
            <MyTasks meId={me.id} people={peopleById} onOpen={openTask} onNew={() => setTaskDraft({})} />
          )}
          {view.kind === 'person' && person && (
            <ConversationArea
              person={person}
              conversation={conversation}
              meId={me.id}
              people={peopleById}
              tab={tab}
              onTabChange={setTab}
              onOpenTask={openTask}
              onNewTask={() => setTaskDraft({ assignee_id: person.id })}
              onScheduleMeeting={setMeetingChat}
              onRemindMessage={(m) => setReminderDraft({ title: m.body.slice(0, 200), target_type: 'message', target_id: m.id })}
              onCreateTaskFromMessage={(m) =>
                setTaskDraft({ title: m.body.slice(0, 200), assignee_id: person.id, source_message_id: m.id })
              }
            />
          )}
        </div>
        <div className={cn(column === 'details' ? 'flex' : 'hidden', 'w-full flex-col overflow-y-auto border-s border-border lg:flex lg:w-80')}>
          <SidePanel
            conversationId={view.kind === 'channel' ? view.channelId : conversation?.id}
            personId={view.kind === 'channel' ? undefined : person?.id}
            onOpenBoard={() => person && showPerson(person.id, 'tasks')}
            onNewReminder={() => setReminderDraft({})}
          />
        </div>
      </main>
      <nav aria-label="Navigation" className="flex border-t border-border md:hidden">
        {NAV.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setColumn(id)}
            aria-current={column === id}
            className={cn('flex min-h-14 flex-1 flex-col items-center justify-center text-xs', column === id ? 'text-accent' : 'text-muted-foreground')}
          >
            <Icon className="size-5" aria-hidden />
            {t(`nav.${id}`)}
          </button>
        ))}
      </nav>
      {creatingChannel && (
        <ChannelForm people={people} onDone={(c) => {
          setCreatingChannel(false)
          if (c) show({ kind: 'channel', channelId: c.id })
        }} />
      )}
      {meetingChat && <MeetingForm people={people} conversationId={meetingChat} onDone={() => setMeetingChat(null)} />}
      {reminderDraft && <ReminderForm initial={reminderDraft} onDone={() => setReminderDraft(null)} />}
      {taskDraft && (
        <TaskForm
          people={people}
          initial={taskDraft}
          onCancel={() => setTaskDraft(null)}
          onCreated={(task) => {
            setTaskDraft(null)
            openTask(task)
          }}
        />
      )}
    </div>
  )
}
