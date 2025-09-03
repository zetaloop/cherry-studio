import ModelTagsWithLabel from '@renderer/components/ModelTagsWithLabel'
import { useQuickPanel } from '@renderer/components/QuickPanel'
import { QuickPanelCallBackOptions, QuickPanelListItem } from '@renderer/components/QuickPanel/types'
import { getModelLogo, isEmbeddingModel, isRerankModel, isVisionModel } from '@renderer/config/models'
import db from '@renderer/databases'
import { useProviders } from '@renderer/hooks/useProvider'
import { getModelUniqId } from '@renderer/services/ModelService'
import { FileType, Model } from '@renderer/types'
import { getFancyProviderName } from '@renderer/utils'
import { Avatar, Tooltip } from 'antd'
import { useLiveQuery } from 'dexie-react-hooks'
import { first, sortBy } from 'lodash'
import { AtSign, CircleX, Plus } from 'lucide-react'
import { FC, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import styled from 'styled-components'

export interface MentionModelsButtonRef {
  openQuickPanel: (triggerInfo?: { type: 'input' | 'button'; position?: number; originalText?: string }) => void
}

interface Props {
  ref?: React.RefObject<MentionModelsButtonRef | null>
  mentionedModels: Model[]
  onMentionModel: (model: Model, options: { mode: 'toggle' | 'add' }) => void
  onClearMentionModels: () => void
  couldMentionNotVisionModel: boolean
  files: FileType[]
  ToolbarButton: any
  setText: React.Dispatch<React.SetStateAction<string>>
}

const MentionModelsButton: FC<Props> = ({
  ref,
  mentionedModels,
  onMentionModel,
  onClearMentionModels,
  couldMentionNotVisionModel,
  files,
  ToolbarButton,
  setText
}) => {
  const { providers } = useProviders()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const quickPanel = useQuickPanel()

  // 记录是否有模型被选择的动作发生
  const hasModelActionRef = useRef<boolean>(false)
  // 记录触发信息，用于清除操作
  const triggerInfoRef = useRef<{ type: 'input' | 'button'; position?: number; originalText?: string } | undefined>(
    undefined
  )

  // 基于光标 + 搜索词定位并删除最近一次触发的 @ 及搜索文本
  const removeAtSymbolAndText = useCallback(
    (currentText: string, caretPosition: number, searchText?: string, fallbackPosition?: number) => {
      const safeCaret = Math.max(0, Math.min(caretPosition ?? 0, currentText.length))

      // ESC/精确删除：优先按 pattern = "@" + searchText 从光标向左最近匹配
      if (searchText !== undefined) {
        const pattern = '@' + searchText
        const fromIndex = Math.max(0, safeCaret - 1)
        const start = currentText.lastIndexOf(pattern, fromIndex)
        if (start !== -1) {
          const end = start + pattern.length
          return currentText.slice(0, start) + currentText.slice(end)
        }

        // 兜底：使用打开时的 position 做校验后再删
        if (typeof fallbackPosition === 'number' && currentText[fallbackPosition] === '@') {
          const expected = pattern
          const actual = currentText.slice(fallbackPosition, fallbackPosition + expected.length)
          if (actual === expected) {
            return currentText.slice(0, fallbackPosition) + currentText.slice(fallbackPosition + expected.length)
          }
          // 如果不完全匹配，安全起见仅删除单个 '@'
          return currentText.slice(0, fallbackPosition) + currentText.slice(fallbackPosition + 1)
        }

        // 未找到匹配则不改动
        return currentText
      }

      // 清除按钮：未知搜索词，删除离光标最近的 '@' 及后续连续非空白（到空格/换行/结尾）
      {
        const fromIndex = Math.max(0, safeCaret - 1)
        const start = currentText.lastIndexOf('@', fromIndex)
        if (start === -1) {
          // 兜底：使用打开时的 position（若存在），按空白边界删除
          if (typeof fallbackPosition === 'number' && currentText[fallbackPosition] === '@') {
            let endPos = fallbackPosition + 1
            while (endPos < currentText.length && currentText[endPos] !== ' ' && currentText[endPos] !== '\n') {
              endPos++
            }
            return currentText.slice(0, fallbackPosition) + currentText.slice(endPos)
          }
          return currentText
        }

        let endPos = start + 1
        while (endPos < currentText.length && currentText[endPos] !== ' ' && currentText[endPos] !== '\n') {
          endPos++
        }
        return currentText.slice(0, start) + currentText.slice(endPos)
      }
    },
    []
  )

  const pinnedModels = useLiveQuery(
    async () => {
      const setting = await db.settings.get('pinned:models')
      return setting?.value || []
    },
    [],
    []
  )

  const modelItems = useMemo(() => {
    const items: QuickPanelListItem[] = []
    const mentionModelCounts = mentionedModels.reduce(
      (acc, model) => {
        const modelId = getModelUniqId(model)
        acc[modelId] = (acc[modelId] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    if (pinnedModels.length > 0) {
      const pinnedItems = providers.flatMap((p) =>
        p.models
          .filter((m) => !isEmbeddingModel(m) && !isRerankModel(m))
          .filter((m) => pinnedModels.includes(getModelUniqId(m)))
          .filter((m) => couldMentionNotVisionModel || (!couldMentionNotVisionModel && isVisionModel(m)))
          .map((m) => {
            const modelId = getModelUniqId(m)
            const selectionCount = mentionModelCounts[modelId] || 0
            return {
              label: (
                <>
                  <ProviderName>{getFancyProviderName(p)}</ProviderName>
                  <span style={{ opacity: 0.8 }}> | {m.name}</span>
                </>
              ),
              description: <ModelTagsWithLabel model={m} showLabel={false} size={10} style={{ opacity: 0.8 }} />,
              icon: (
                <Avatar src={getModelLogo(m.id)} size={20}>
                  {first(m.name)}
                </Avatar>
              ),
              filterText: getFancyProviderName(p) + m.name,
              action: (options: QuickPanelCallBackOptions) => {
                hasModelActionRef.current = true // 标记有模型动作发生
                onMentionModel(m, { mode: options.mode || 'toggle' })
              },
              isSelected: selectionCount > 0,
              selectionCount
            } as QuickPanelListItem
          })
      )

      if (pinnedItems.length > 0) {
        items.push(...sortBy(pinnedItems, ['label']))
      }
    }

    providers.forEach((p) => {
      const providerModels = sortBy(
        p.models
          .filter((m) => !isEmbeddingModel(m) && !isRerankModel(m))
          .filter((m) => !pinnedModels.includes(getModelUniqId(m)))
          .filter((m) => couldMentionNotVisionModel || (!couldMentionNotVisionModel && isVisionModel(m))),
        ['group', 'name']
      )

      const providerModelItems = providerModels.map((m) => {
        const modelId = getModelUniqId(m)
        const selectionCount = mentionModelCounts[modelId] || 0
        return {
          label: (
            <>
              <ProviderName>{getFancyProviderName(p)}</ProviderName>
              <span style={{ opacity: 0.8 }}> | {m.name}</span>
            </>
          ),
          description: <ModelTagsWithLabel model={m} showLabel={false} size={10} style={{ opacity: 0.8 }} />,
          icon: (
            <Avatar src={getModelLogo(m.id)} size={20}>
              {first(m.name)}
            </Avatar>
          ),
          filterText: getFancyProviderName(p) + m.name,
          action: (options: QuickPanelCallBackOptions) => {
            hasModelActionRef.current = true // 标记有模型动作发生
            onMentionModel(m, { mode: options.mode || 'toggle' })
          },
          isSelected: selectionCount > 0,
          selectionCount
        } as QuickPanelListItem
      })

      if (providerModelItems.length > 0) {
        items.push(...providerModelItems)
      }
    })

    items.push({
      label: t('settings.models.add.add_model') + '...',
      icon: <Plus />,
      action: () => navigate('/settings/provider'),
      isSelected: false
    })

    items.unshift({
      label: t('settings.input.clear.all'),
      description: t('settings.input.clear.models'),
      icon: <CircleX />,
      alwaysVisible: true,
      isSelected: false,
      action: () => {
        onClearMentionModels()

        // 只有输入触发时才需要删除 @ 与搜索文本（未知搜索词，按光标就近删除）
        if (triggerInfoRef.current?.type === 'input') {
          setText((currentText) => {
            const textArea = document.querySelector('.inputbar textarea') as HTMLTextAreaElement | null
            const caret = textArea ? (textArea.selectionStart ?? currentText.length) : currentText.length
            return removeAtSymbolAndText(currentText, caret, undefined, triggerInfoRef.current?.position)
          })
        }

        quickPanel.close()
      }
    })

    return items
  }, [
    pinnedModels,
    providers,
    t,
    couldMentionNotVisionModel,
    mentionedModels,
    onMentionModel,
    navigate,
    quickPanel,
    onClearMentionModels,
    setText,
    removeAtSymbolAndText
  ])

  const openQuickPanel = useCallback(
    (triggerInfo?: { type: 'input' | 'button'; position?: number; originalText?: string }) => {
      // 重置模型动作标记
      hasModelActionRef.current = false
      // 保存触发信息
      triggerInfoRef.current = triggerInfo

      quickPanel.open({
        title: t('agents.edit.model.select.title'),
        list: modelItems,
        symbol: '@',
        multiple: true,
        multipleRepeat: true,
        triggerInfo: triggerInfo || { type: 'button' },
        onClose({ action, triggerInfo: closeTriggerInfo, searchText }) {
          // ESC关闭时的处理：删除 @ 和搜索文本
          if (action === 'esc') {
            // 只有在输入触发且有模型选择动作时才删除@字符和搜索文本
            if (
              hasModelActionRef.current &&
              closeTriggerInfo?.type === 'input' &&
              closeTriggerInfo?.position !== undefined
            ) {
              // 基于当前光标 + 搜索词精确定位并删除，position 仅作兜底
              setText((currentText) => {
                const textArea = document.querySelector('.inputbar textarea') as HTMLTextAreaElement | null
                const caret = textArea ? (textArea.selectionStart ?? currentText.length) : currentText.length
                return removeAtSymbolAndText(currentText, caret, searchText || '', closeTriggerInfo.position!)
              })
            }
          }
          // Backspace删除@的情况（delete-symbol）：
          // @ 已经被Backspace自然删除，面板关闭，不需要额外操作
        }
      })
    },
    [modelItems, quickPanel, t, setText, removeAtSymbolAndText]
  )

  const handleOpenQuickPanel = useCallback(() => {
    if (quickPanel.isVisible && quickPanel.symbol === '@') {
      quickPanel.close()
    } else {
      openQuickPanel({ type: 'button' })
    }
  }, [openQuickPanel, quickPanel])

  const filesRef = useRef(files)

  useEffect(() => {
    // 检查files是否变化
    if (filesRef.current !== files) {
      if (quickPanel.isVisible && quickPanel.symbol === '@') {
        quickPanel.close()
      }
      filesRef.current = files
    }
  }, [files, quickPanel])

  useImperativeHandle(ref, () => ({
    openQuickPanel
  }))

  return (
    <Tooltip placement="top" title={t('agents.edit.model.select.title')} mouseLeaveDelay={0} arrow>
      <ToolbarButton type="text" onClick={handleOpenQuickPanel}>
        <AtSign size={18} color={mentionedModels.length > 0 ? 'var(--color-primary)' : 'var(--color-icon)'} />
      </ToolbarButton>
    </Tooltip>
  )
}

const ProviderName = styled.span`
  font-weight: 500;
`

export default memo(MentionModelsButton)
