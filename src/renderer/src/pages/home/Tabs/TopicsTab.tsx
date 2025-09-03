import { DraggableVirtualList } from '@renderer/components/DraggableList'
import { CopyIcon, DeleteIcon, EditIcon } from '@renderer/components/Icons'
import ObsidianExportPopup from '@renderer/components/Popups/ObsidianExportPopup'
import PromptPopup from '@renderer/components/Popups/PromptPopup'
import SaveToKnowledgePopup from '@renderer/components/Popups/SaveToKnowledgePopup'
import { isMac } from '@renderer/config/constant'
import { useAssistant, useAssistants } from '@renderer/hooks/useAssistant'
import { useInPlaceEdit } from '@renderer/hooks/useInPlaceEdit'
import { useNotesSettings } from '@renderer/hooks/useNotesSettings'
import { modelGenerating } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings'
import { finishTopicRenaming, startTopicRenaming, TopicManager } from '@renderer/hooks/useTopic'
import { fetchMessagesSummary } from '@renderer/services/ApiService'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import store, { useAppDispatch } from '@renderer/store'
import { RootState } from '@renderer/store'
import { selectMessagesForTopic } from '@renderer/store/newMessage'
import { newMessagesActions } from '@renderer/store/newMessage'
import { setGenerating } from '@renderer/store/runtime'
import { cloneMessagesToNewTopicThunk, loadTopicMessagesThunk } from '@renderer/store/thunk/messageThunk'
import { Assistant, Topic } from '@renderer/types'
import { classNames, removeSpecialCharactersForFileName } from '@renderer/utils'
import { copyTopicAsMarkdown, copyTopicAsPlainText } from '@renderer/utils/copy'
import {
  exportMarkdownToJoplin,
  exportMarkdownToSiyuan,
  exportMarkdownToYuque,
  exportTopicAsMarkdown,
  exportTopicToNotes,
  exportTopicToNotion,
  topicToMarkdown
} from '@renderer/utils/export'
import { Dropdown, MenuProps, Tooltip } from 'antd'
import { ItemType, MenuItemType } from 'antd/es/menu/interface'
import dayjs from 'dayjs'
import { findIndex } from 'lodash'
import {
  BrushCleaning,
  FolderOpen,
  HelpCircle,
  MenuIcon,
  PackagePlus,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Save,
  Sparkles,
  Split,
  UploadIcon,
  XIcon
} from 'lucide-react'
import { FC, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

// const logger = loggerService.withContext('TopicsTab')

interface Props {
  assistant: Assistant
  activeTopic: Topic
  setActiveTopic: (topic: Topic) => void
  position: 'left' | 'right'
}

const Topics: FC<Props> = ({ assistant: _assistant, activeTopic, setActiveTopic, position }) => {
  const { t } = useTranslation()
  const { notesPath } = useNotesSettings()
  const { assistants } = useAssistants()
  const { assistant, addTopic, removeTopic, moveTopic, updateTopic, updateTopics } = useAssistant(_assistant.id)
  const { showTopicTime, pinTopicsToTop, setTopicPosition, topicPosition } = useSettings()

  const renamingTopics = useSelector((state: RootState) => state.runtime.chat.renamingTopics)
  const topicLoadingQuery = useSelector((state: RootState) => state.messages.loadingByTopic)
  const topicFulfilledQuery = useSelector((state: RootState) => state.messages.fulfilledByTopic)
  const newlyRenamedTopics = useSelector((state: RootState) => state.runtime.chat.newlyRenamedTopics)

  const borderRadius = showTopicTime ? 12 : 'var(--list-item-border-radius)'

  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null)
  const deleteTimerRef = useRef<NodeJS.Timeout>(null)
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null)

  const topicEdit = useInPlaceEdit({
    onSave: (name: string) => {
      const topic = assistant.topics.find((t) => t.id === editingTopicId)
      if (topic && name !== topic.name) {
        const updatedTopic = { ...topic, name, isNameManuallyEdited: true }
        updateTopic(updatedTopic)
        window.message.success(t('common.saved'))
      }
      setEditingTopicId(null)
    },
    onCancel: () => {
      setEditingTopicId(null)
    }
  })

  const isPending = useCallback((topicId: string) => topicLoadingQuery[topicId], [topicLoadingQuery])
  const isFulfilled = useCallback((topicId: string) => topicFulfilledQuery[topicId], [topicFulfilledQuery])
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(newMessagesActions.setTopicFulfilled({ topicId: activeTopic.id, fulfilled: false }))
  }, [activeTopic.id, dispatch, topicFulfilledQuery])

  const isRenaming = useCallback(
    (topicId: string) => {
      return renamingTopics.includes(topicId)
    },
    [renamingTopics]
  )

  const isNewlyRenamed = useCallback(
    (topicId: string) => {
      return newlyRenamedTopics.includes(topicId)
    },
    [newlyRenamedTopics]
  )

  const handleDeleteClick = useCallback((topicId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current)
    }

    setDeletingTopicId(topicId)

    deleteTimerRef.current = setTimeout(() => setDeletingTopicId(null), 2000)
  }, [])

  const onClearMessages = useCallback((topic: Topic) => {
    // window.keyv.set(EVENT_NAMES.CHAT_COMPLETION_PAUSED, true)
    store.dispatch(setGenerating(false))
    EventEmitter.emit(EVENT_NAMES.CLEAR_MESSAGES, topic)
  }, [])

  const handleConfirmDelete = useCallback(
    async (topic: Topic, e: React.MouseEvent) => {
      e.stopPropagation()
      if (assistant.topics.length === 1) {
        return onClearMessages(topic)
      }
      await modelGenerating()
      const index = findIndex(assistant.topics, (t) => t.id === topic.id)
      if (topic.id === activeTopic.id) {
        setActiveTopic(assistant.topics[index + 1 === assistant.topics.length ? index - 1 : index + 1])
      }
      removeTopic(topic)
      setDeletingTopicId(null)
    },
    [activeTopic.id, assistant.topics, onClearMessages, removeTopic, setActiveTopic]
  )

  const onPinTopic = useCallback(
    (topic: Topic) => {
      const updatedTopic = { ...topic, pinned: !topic.pinned }
      updateTopic(updatedTopic)
    },
    [updateTopic]
  )

  const onDeleteTopic = useCallback(
    async (topic: Topic) => {
      await modelGenerating()
      if (topic.id === activeTopic?.id) {
        const index = findIndex(assistant.topics, (t) => t.id === topic.id)
        setActiveTopic(assistant.topics[index + 1 === assistant.topics.length ? index - 1 : index + 1])
      }
      removeTopic(topic)
    },
    [assistant.topics, removeTopic, setActiveTopic, activeTopic]
  )

  const onMoveTopic = useCallback(
    async (topic: Topic, toAssistant: Assistant) => {
      await modelGenerating()
      const index = findIndex(assistant.topics, (t) => t.id === topic.id)
      setActiveTopic(assistant.topics[index + 1 === assistant.topics.length ? 0 : index + 1])
      moveTopic(topic, toAssistant)
    },
    [assistant.topics, moveTopic, setActiveTopic]
  )

  const onSwitchTopic = useCallback(
    async (topic: Topic) => {
      // await modelGenerating()
      setActiveTopic(topic)
    },
    [setActiveTopic]
  )

  const exportMenuOptions = useSelector((state: RootState) => state.settings.exportMenuOptions)

  const [_targetTopic, setTargetTopic] = useState<Topic | null>(null)
  const targetTopic = useDeferredValue(_targetTopic)
  const getTopicMenuItems = useMemo(() => {
    const topic = targetTopic
    if (!topic) return []

    const menus: MenuProps['items'] = [
      {
        label: t('chat.topics.auto_rename'),
        key: 'auto-rename',
        icon: <Sparkles size={14} />,
        disabled: isRenaming(topic.id),
        async onClick() {
          const messages = await TopicManager.getTopicMessages(topic.id)
          if (messages.length >= 2) {
            startTopicRenaming(topic.id)
            try {
              const summaryText = await fetchMessagesSummary({ messages, assistant })
              if (summaryText) {
                const updatedTopic = { ...topic, name: summaryText, isNameManuallyEdited: false }
                updateTopic(updatedTopic)
              } else {
                window.message?.error(t('message.error.fetchTopicName'))
              }
            } finally {
              finishTopicRenaming(topic.id)
            }
          }
        }
      },
      {
        label: t('chat.topics.edit.title'),
        key: 'rename',
        icon: <EditIcon size={14} />,
        disabled: isRenaming(topic.id),
        async onClick() {
          const name = await PromptPopup.show({
            title: t('chat.topics.edit.title'),
            message: '',
            defaultValue: topic?.name || '',
            extraNode: (
              <div style={{ color: 'var(--color-text-3)', marginTop: 8 }}>{t('chat.topics.edit.title_tip')}</div>
            )
          })
          if (name && topic?.name !== name) {
            const updatedTopic = { ...topic, name, isNameManuallyEdited: true }
            updateTopic(updatedTopic)
          }
        }
      },
      {
        label: t('chat.topics.prompt.label'),
        key: 'topic-prompt',
        icon: <PackagePlus size={14} />,
        extra: (
          <Tooltip title={t('chat.topics.prompt.tips')}>
            <HelpCircle size={14} />
          </Tooltip>
        ),
        async onClick() {
          const prompt = await PromptPopup.show({
            title: t('chat.topics.prompt.edit.title'),
            message: '',
            defaultValue: topic?.prompt || '',
            inputProps: {
              rows: 8,
              allowClear: true
            }
          })

          prompt !== null &&
            (() => {
              const updatedTopic = { ...topic, prompt: prompt.trim() }
              updateTopic(updatedTopic)
              topic.id === activeTopic.id && setActiveTopic(updatedTopic)
            })()
        }
      },
      {
        label: topic.pinned ? t('chat.topics.unpin') : t('chat.topics.pin'),
        key: 'pin',
        icon: topic.pinned ? <PinOffIcon size={14} /> : <PinIcon size={14} />,
        onClick() {
          onPinTopic(topic)
        }
      },
      {
        label: t('chat.topics.clear.title'),
        key: 'clear-messages',
        icon: <BrushCleaning size={14} />,
        async onClick() {
          window.modal.confirm({
            title: t('chat.input.clear.content'),
            centered: true,
            onOk: () => onClearMessages(topic)
          })
        }
      },
      {
        label: t('settings.topic.position.label'),
        key: 'topic-position',
        icon: <MenuIcon size={14} />,
        children: [
          {
            label: t('settings.topic.position.left'),
            key: 'left',
            onClick: () => setTopicPosition('left')
          },
          {
            label: t('settings.topic.position.right'),
            key: 'right',
            onClick: () => setTopicPosition('right')
          }
        ]
      },
      {
        label: t('chat.message.new.branch.label'),
        key: 'new-branch',
        icon: <Split size={14} />,
        async onClick() {
          try {
            await dispatch(loadTopicMessagesThunk(topic.id))

            const newTopic = getDefaultTopic(assistant.id)
            newTopic.name = topic.name
            addTopic(newTopic)

            const state = store.getState()
            const sourceMessages = selectMessagesForTopic(state, topic.id) || []
            const count = sourceMessages.length
            const success = await dispatch(cloneMessagesToNewTopicThunk(topic.id, count, newTopic))

            if (success) {
              setActiveTopic(newTopic)
              window.message.success(t('chat.message.new.branch.created'))
            } else {
              window.message.error(t('message.branch.error'))
            }
          } catch (e) {
            window.message.error(t('message.branch.error'))
          }
        }
      },
      {
        label: t('chat.topics.copy.title'),
        key: 'copy',
        icon: <CopyIcon size={14} />,
        children: [
          {
            label: t('chat.topics.copy.image'),
            key: 'img',
            onClick: () => EventEmitter.emit(EVENT_NAMES.COPY_TOPIC_IMAGE, topic)
          },
          {
            label: t('chat.topics.copy.md'),
            key: 'md',
            onClick: () => copyTopicAsMarkdown(topic)
          },
          {
            label: t('chat.topics.copy.plain_text'),
            key: 'plain_text',
            onClick: () => copyTopicAsPlainText(topic)
          }
        ]
      },
      {
        label: t('chat.save.label'),
        key: 'save',
        icon: <Save size={14} />,
        children: [
          {
            label: t('chat.save.topic.knowledge.title'),
            key: 'knowledge',
            onClick: async () => {
              try {
                const result = await SaveToKnowledgePopup.showForTopic(topic)
                if (result?.success) {
                  window.message.success(t('chat.save.topic.knowledge.success', { count: result.savedCount }))
                }
              } catch {
                window.message.error(t('chat.save.topic.knowledge.error.save_failed'))
              }
            }
          },
          {
            label: t('notes.save'),
            key: 'notes',
            onClick: async () => {
              exportTopicToNotes(topic, notesPath)
            }
          }
        ]
      },
      {
        label: t('chat.topics.export.title'),
        key: 'export',
        icon: <UploadIcon size={14} />,
        children: [
          exportMenuOptions.image && {
            label: t('chat.topics.export.image'),
            key: 'image',
            onClick: () => EventEmitter.emit(EVENT_NAMES.EXPORT_TOPIC_IMAGE, topic)
          },
          exportMenuOptions.markdown && {
            label: t('chat.topics.export.md.label'),
            key: 'markdown',
            onClick: () => exportTopicAsMarkdown(topic)
          },
          exportMenuOptions.markdown_reason && {
            label: t('chat.topics.export.md.reason'),
            key: 'markdown_reason',
            onClick: () => exportTopicAsMarkdown(topic, true)
          },
          exportMenuOptions.docx && {
            label: t('chat.topics.export.word'),
            key: 'word',
            onClick: async () => {
              const markdown = await topicToMarkdown(topic)
              window.api.export.toWord(markdown, removeSpecialCharactersForFileName(topic.name))
            }
          },
          exportMenuOptions.notion && {
            label: t('chat.topics.export.notion'),
            key: 'notion',
            onClick: async () => {
              exportTopicToNotion(topic)
            }
          },
          exportMenuOptions.yuque && {
            label: t('chat.topics.export.yuque'),
            key: 'yuque',
            onClick: async () => {
              const markdown = await topicToMarkdown(topic)
              exportMarkdownToYuque(topic.name, markdown)
            }
          },
          exportMenuOptions.obsidian && {
            label: t('chat.topics.export.obsidian'),
            key: 'obsidian',
            onClick: async () => {
              await ObsidianExportPopup.show({ title: topic.name, topic, processingMethod: '3' })
            }
          },
          exportMenuOptions.joplin && {
            label: t('chat.topics.export.joplin'),
            key: 'joplin',
            onClick: async () => {
              const topicMessages = await TopicManager.getTopicMessages(topic.id)
              exportMarkdownToJoplin(topic.name, topicMessages)
            }
          },
          exportMenuOptions.siyuan && {
            label: t('chat.topics.export.siyuan'),
            key: 'siyuan',
            onClick: async () => {
              const markdown = await topicToMarkdown(topic)
              exportMarkdownToSiyuan(topic.name, markdown)
            }
          }
        ].filter(Boolean) as ItemType<MenuItemType>[]
      }
    ]

    if (assistants.length > 1 && assistant.topics.length > 1) {
      menus.push({
        label: t('chat.topics.move_to'),
        key: 'move',
        icon: <FolderOpen size={14} />,
        children: assistants
          .filter((a) => a.id !== assistant.id)
          .map((a) => ({
            label: a.name,
            key: a.id,
            onClick: () => onMoveTopic(topic, a)
          }))
      })
    }

    if (assistant.topics.length > 1 && !topic.pinned) {
      menus.push({ type: 'divider' })
      menus.push({
        label: t('common.delete'),
        danger: true,
        key: 'delete',
        icon: <DeleteIcon size={14} className="lucide-custom" />,
        onClick: () => onDeleteTopic(topic)
      })
    }

    return menus
  }, [
    targetTopic,
    t,
    isRenaming,
    exportMenuOptions.image,
    exportMenuOptions.markdown,
    exportMenuOptions.markdown_reason,
    exportMenuOptions.docx,
    exportMenuOptions.notion,
    exportMenuOptions.yuque,
    exportMenuOptions.obsidian,
    exportMenuOptions.joplin,
    exportMenuOptions.siyuan,
    assistants,
    notesPath,
    assistant,
    updateTopic,
    activeTopic.id,
    setActiveTopic,
    onPinTopic,
    onClearMessages,
    setTopicPosition,
    onMoveTopic,
    onDeleteTopic,
    addTopic,
    dispatch
  ])

  // Sort topics based on pinned status if pinTopicsToTop is enabled
  const sortedTopics = useMemo(() => {
    if (pinTopicsToTop) {
      return [...assistant.topics].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return 0
      })
    }
    return assistant.topics
  }, [assistant.topics, pinTopicsToTop])

  const singlealone = topicPosition === 'right' && position === 'right'

  return (
    <DraggableVirtualList
      className="topics-tab"
      list={sortedTopics}
      onUpdate={updateTopics}
      style={{ height: '100%', padding: '13px 0 10px 10px' }}
      itemContainerStyle={{ paddingBottom: '8px' }}
      header={
        <AddTopicButton onClick={() => EventEmitter.emit(EVENT_NAMES.ADD_NEW_TOPIC)}>
          <PlusIcon size={16} />
          {t('chat.add.topic.title')}
        </AddTopicButton>
      }>
      {(topic) => {
        const isActive = topic.id === activeTopic?.id
        const topicName = topic.name.replace('`', '')
        const topicPrompt = topic.prompt
        const fullTopicPrompt = t('common.prompt') + ': ' + topicPrompt

        const getTopicNameClassName = () => {
          if (isRenaming(topic.id)) return 'shimmer'
          if (isNewlyRenamed(topic.id)) return 'typing'
          return ''
        }

        return (
          <Dropdown menu={{ items: getTopicMenuItems }} trigger={['contextMenu']}>
            <TopicListItem
              onContextMenu={() => setTargetTopic(topic)}
              className={classNames(isActive ? 'active' : '', singlealone ? 'singlealone' : '')}
              onClick={editingTopicId === topic.id && topicEdit.isEditing ? undefined : () => onSwitchTopic(topic)}
              style={{
                borderRadius,
                cursor: editingTopicId === topic.id && topicEdit.isEditing ? 'default' : 'pointer'
              }}>
              {isPending(topic.id) && !isActive && <PendingIndicator />}
              {isFulfilled(topic.id) && !isActive && <FulfilledIndicator />}
              <TopicNameContainer>
                {editingTopicId === topic.id && topicEdit.isEditing ? (
                  <TopicEditInput
                    ref={topicEdit.inputRef}
                    value={topicEdit.editValue}
                    onChange={topicEdit.handleInputChange}
                    onKeyDown={topicEdit.handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <TopicName
                    className={getTopicNameClassName()}
                    title={topicName}
                    onDoubleClick={() => {
                      setEditingTopicId(topic.id)
                      topicEdit.startEdit(topic.name)
                    }}>
                    {topicName}
                  </TopicName>
                )}
                {!topic.pinned && (
                  <Tooltip
                    placement="bottom"
                    mouseEnterDelay={0.7}
                    mouseLeaveDelay={0}
                    title={
                      <div style={{ fontSize: '12px', opacity: 0.8, fontStyle: 'italic' }}>
                        {t('chat.topics.delete.shortcut', { key: isMac ? '⌘' : 'Ctrl' })}
                      </div>
                    }>
                    <MenuButton
                      className="menu"
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          handleConfirmDelete(topic, e)
                        } else if (deletingTopicId === topic.id) {
                          handleConfirmDelete(topic, e)
                        } else {
                          handleDeleteClick(topic.id, e)
                        }
                      }}>
                      {deletingTopicId === topic.id ? (
                        <DeleteIcon size={14} color="var(--color-error)" style={{ pointerEvents: 'none' }} />
                      ) : (
                        <XIcon size={14} color="var(--color-text-3)" style={{ pointerEvents: 'none' }} />
                      )}
                    </MenuButton>
                  </Tooltip>
                )}
                {topic.pinned && (
                  <MenuButton className="pin">
                    <PinIcon size={14} color="var(--color-text-3)" />
                  </MenuButton>
                )}
              </TopicNameContainer>
              {topicPrompt && (
                <TopicPromptText className="prompt" title={fullTopicPrompt}>
                  {fullTopicPrompt}
                </TopicPromptText>
              )}
              {showTopicTime && <TopicTime className="time">{dayjs(topic.createdAt).format('MM/DD HH:mm')}</TopicTime>}
            </TopicListItem>
          </Dropdown>
        )
      }}
    </DraggableVirtualList>
  )
}

const TopicListItem = styled.div`
  padding: 7px 12px;
  border-radius: var(--list-item-border-radius);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  width: calc(var(--assistants-width) - 20px);

  .menu {
    opacity: 0;
    color: var(--color-text-3);
  }

  &:hover {
    background-color: var(--color-list-item-hover);
    transition: background-color 0.1s;

    .menu {
      opacity: 1;
    }
  }

  &.active {
    background-color: var(--color-list-item);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    .menu {
      opacity: 1;

      &:hover {
        color: var(--color-text-2);
      }
    }
  }
  &.singlealone {
    border-radius: 0 !important;
    &:hover {
      background-color: var(--color-background-soft);
    }
    &.active {
      border-left: 2px solid var(--color-primary);
      box-shadow: none;
    }
  }
`

const TopicNameContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  height: 20px;
  justify-content: space-between;
`

const TopicName = styled.div`
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  position: relative;
  will-change: background-position, width;

  --color-shimmer-mid: var(--color-text-1);
  --color-shimmer-end: color-mix(in srgb, var(--color-text-1) 25%, transparent);

  &.shimmer {
    background: linear-gradient(to left, var(--color-shimmer-end), var(--color-shimmer-mid), var(--color-shimmer-end));
    background-size: 200% 100%;
    background-clip: text;
    color: transparent;
    animation: shimmer 3s linear infinite;
  }

  &.typing {
    display: block;
    -webkit-line-clamp: unset;
    -webkit-box-orient: unset;
    white-space: nowrap;
    overflow: hidden;
    animation: typewriter 0.5s steps(40, end);
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @keyframes typewriter {
    from {
      width: 0;
    }
    to {
      width: 100%;
    }
  }
`

const TopicEditInput = styled.input`
  background: var(--color-background);
  border: none;
  color: var(--color-text-1);
  font-size: 13px;
  font-family: inherit;
  padding: 2px 6px;
  width: 100%;
  outline: none;
  padding: 0;
`

const PendingIndicator = styled.div.attrs({
  className: 'animation-pulse'
})`
  --pulse-size: 5px;
  width: 5px;
  height: 5px;
  position: absolute;
  left: 3px;
  top: 15px;
  border-radius: 50%;
  background-color: var(--color-status-warning);
`

const FulfilledIndicator = styled.div.attrs({
  className: 'animation-pulse'
})`
  --pulse-size: 5px;
  width: 5px;
  height: 5px;
  position: absolute;
  left: 3px;
  top: 15px;
  border-radius: 50%;
  background-color: var(--color-status-success);
`

const AddTopicButton = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - 10px);
  padding: 7px 12px;
  margin-bottom: 8px;
  background: transparent;
  color: var(--color-text-2);
  font-size: 13px;
  border-radius: var(--list-item-border-radius);
  cursor: pointer;
  transition: all 0.2s;
  margin-top: -5px;

  &:hover {
    background-color: var(--color-list-item-hover);
    color: var(--color-text-1);
  }

  .anticon {
    font-size: 12px;
  }
`

const TopicPromptText = styled.div`
  color: var(--color-text-2);
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  ~ .prompt-text {
    margin-top: 10px;
  }
`

const TopicTime = styled.div`
  color: var(--color-text-3);
  font-size: 11px;
`

const MenuButton = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
  .anticon {
    font-size: 12px;
  }
`

export default Topics
