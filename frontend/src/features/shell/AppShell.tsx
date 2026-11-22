import { House, Info, LayoutList, MessageSquare, Menu, Users } from 'lucide-react'
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
import { EmptyState } from '@/components/ui/empty-state'
import { HomeView } from '@/features/home/HomeView'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

import { ConversationArea, type ConversationTab } from './ConversationArea'
import { PeoplePanel, type Activity, type Page } from './PeoplePanel'
import { SidePanel } from './SidePanel'
import { Logo } from './Logo'
import { TopBar } from './TopBar'

type Column = 'people' | 'conversation' | 'details'
type View = { kind: 'home' } | { kind: 'person' } | { kind: 'myTasks' } | { kind: 'assistant' } | { kind: 'preferences' }
  | { kind: 'playbooks' }
  | { kind: 'calendar' }
  | { kind: 'requests' }
  | { kind: 'projects'; projectId?: string }
  | { kind: 'dashboard' }
  | { kind: 'channel'; channelId: string }
  | { kind: 'channels' }
  | { kind: 'report'; runId: string } | { kind: 'task'; taskId: string }

const PAGE_KINDS = new Set<string>(['home', 'assistant', 'myTasks', 'calendar', 'projects', 'requests', 'playbooks', 'dashboard'])
/** Conversations show the side panel (pins, files, tasks, reminders); full pages use the whole width. */
const SIDE_PANEL_VIEWS = new Set<string>(['person', 'channel'])

/** Name of the current view in the phone's bottom bar. */
const VIEW_LABELS: Record<string, string> = {
  myTasks: 'tasks.myTasks', calendar: 'calendar.title', projects: 'projects.title', requests: 'requests.title',
  playbooks: 'playbooks.title', report: 'playbooks.title', dashboard: 'dashboard.title', assistant: 'people.myAssistant',
  preferences: 'notifications.preferences', channels: 'channels.browse', task: 'tabs.tasks',
}

/** Three columns on desktop; one column at a time with bottom navigation on mobile. */
export function AppShell({ me }: { me: User }) {
  const { t } = useTranslation()
  const allPeople = usePeople().data
  const conversations = useConversations().data
  const [selectedId, setSelectedId] = useState<string>()
  const [column, setColumn] = useState<Column>('conversation')
  const [view, setView] = useState<View>({ kind: 'home' })
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
  const person = people.find((p) => p.id === selectedId)
  const conversation = useDirectConversation(person?.id).data

  // Unread count, last message and time per person (direct chat) and per channel.
  const activity = useMemo(() => {
    const map = new Map<string, Activity>()
    for (const c of conversations ?? []) {
      const key = c.type === 'direct' ? c.member_ids.find((id) => id !== me.id) : c.type === 'channel' ? c.id : undefined
      if (!key) continue
      const last = c.last_message
      map.set(key, {
        unread: key === person?.id && view.kind === 'person' ? 0 : c.unread_count, // the open chat is being read
        preview: last ? (last.deleted ? t('chat.deleted') : last.body.split('\n').find((l) => l.trim()) ?? '') : '',
        at: last?.created_at,
        mine: last?.author_id === me.id,
      })
    }
    return map
  }, [conversations, me.id, person?.id, view.kind, t])

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
    else if (!kind) show({ kind: 'home' })
  }

  useEffect(() => {
    if (!pendingLink || !conversations) return
    history.replaceState(null, '', '/')
    setPendingLink(null) // eslint-disable-line react-hooks/set-state-in-effect -- one-time deep link
    navigate(pendingLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate uses the loaded conversations
  }, [pendingLink, conversations])

  // Re-key the main column on view change so each view fades in.
  const viewKey = view.kind === 'person' ? `person:${person?.id}` : JSON.stringify(view)

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        {/* Sidebar: brand, pages, channels, people */}
        <div className={cn(column === 'people' ? 'flex' : 'hidden', 'w-full shrink-0 flex-col overflow-y-auto border-e border-border bg-sidebar md:flex md:w-72')}>
          <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center bg-sidebar/95 px-5 backdrop-blur">
            <Logo />
          </div>
          <PeoplePanel
            people={people}
            activity={activity}
            selectedId={view.kind === 'person' ? person?.id : undefined}
            activePage={PAGE_KINDS.has(view.kind) ? (view.kind as Page) : undefined}
            onSelect={(p) => showPerson(p.id)}
            isManager={me.role !== 'employee'}
            channels={channels}
            selectedChannelId={view.kind === 'channel' ? view.channelId : undefined}
            onOpenChannel={(id) => show({ kind: 'channel', channelId: id })}
            onBrowseChannels={() => show({ kind: 'channels' })}
            onOpen={(page: Page) => show({ kind: page })}
          />
        </div>

        <div className={cn(column === 'people' ? 'hidden' : 'flex', 'min-w-0 flex-1 flex-col md:flex')}>
          <TopBar me={me} onOpenMessage={(m: Message) => void openConversation(m.conversation_id)} onNavigate={navigate} />
          <main className="flex min-h-0 flex-1">
            <div key={viewKey} className={cn(column === 'conversation' ? 'flex' : 'hidden', 'min-w-0 flex-1 animate-fade-in flex-col md:flex')}>
              {view.kind === 'task' && (
                <TaskView key={view.taskId} taskId={view.taskId} meId={me.id} people={peopleById} onBack={() => setView({ kind: 'home' })}
                  onRemind={(id, title) => setReminderDraft({ title, target_type: 'task', target_id: id })} />
              )}
              {view.kind === 'home' && (
                <HomeView me={me} peopleById={peopleById} conversations={conversations ?? []}
                  onOpenConversation={(id) => void openConversation(id)} onOpenTask={openTask}
                  onOpenPage={(page) => show({ kind: page })} />
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
              {view.kind === 'person' && !person && (
                <EmptyState icon={Users} title={t('people.empty')} className="m-auto" />
              )}
            </div>
            {SIDE_PANEL_VIEWS.has(view.kind) && (
              <div className={cn(column === 'details' ? 'flex' : 'hidden', 'w-full shrink-0 flex-col overflow-y-auto border-s border-border bg-sidebar lg:flex lg:w-80')}>
                <SidePanel
                  conversationId={view.kind === 'channel' ? view.channelId : conversation?.id}
                  personId={view.kind === 'channel' ? undefined : person?.id}
                  onOpenBoard={() => person && showPerson(person.id, 'tasks')}
                  onNewReminder={() => setReminderDraft({})}
                />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile: one column at a time */}
      <nav aria-label={t('nav.title')} className="flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {[
          { id: 'home', Icon: House, label: t('home.title'), active: column === 'conversation' && view.kind === 'home', onClick: () => show({ kind: 'home' }) },
          { id: 'people', Icon: Menu, label: t('nav.menu'), active: column === 'people', onClick: () => setColumn('people') },
          ...(view.kind === 'home' ? [] : [{
            id: 'conversation',
            Icon: SIDE_PANEL_VIEWS.has(view.kind) ? MessageSquare : LayoutList,
            label: SIDE_PANEL_VIEWS.has(view.kind) ? t('nav.conversation') : t(VIEW_LABELS[view.kind] ?? 'nav.conversation'),
            active: column === 'conversation',
            onClick: () => setColumn('conversation'),
          }]),
          ...(SIDE_PANEL_VIEWS.has(view.kind) ? [{ id: 'details', Icon: Info, label: t('nav.details'), active: column === 'details', onClick: () => setColumn('details') }] : []),
        ].map(({ id, Icon, label, active, onClick }) => (
          <button key={id} type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
            className={cn('flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors', active ? 'text-accent' : 'text-muted-foreground')}>
            <Icon className="size-5" aria-hidden />
            <span className="max-w-full truncate">{label}</span>
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
