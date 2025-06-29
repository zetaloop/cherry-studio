import ModelTagsWithLabel from '@renderer/components/ModelTagsWithLabel'
import { useQuickPanel } from '@renderer/components/QuickPanel'
import { QuickPanelCallBackOptions, QuickPanelListItem } from '@renderer/components/QuickPanel/types'
import { getModelLogo, isEmbeddingModel, isRerankModel } from '@renderer/config/models'
import db from '@renderer/databases'
import { useProviders } from '@renderer/hooks/useProvider'
import { getModelUniqId } from '@renderer/services/ModelService'
import { Model } from '@renderer/types'
import { Avatar, Tooltip } from 'antd'
import { useLiveQuery } from 'dexie-react-hooks'
import { first, sortBy } from 'lodash'
import { AtSign, Plus } from 'lucide-react'
import { FC, memo, useCallback, useImperativeHandle, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import styled from 'styled-components'

export interface MentionModelsButtonRef {
  openQuickPanel: () => void
}

interface Props {
  ref?: React.RefObject<MentionModelsButtonRef | null>
  mentionModels: Model[]
  onMentionModel: (model: Model, options: { mode: 'toggle' | 'add' }) => void
  ToolbarButton: any
}

const MentionModelsButton: FC<Props> = ({ ref, mentionModels, onMentionModel, ToolbarButton }) => {
  const { providers } = useProviders()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const quickPanel = useQuickPanel()

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
    const mentionModelCounts = mentionModels.reduce(
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
          .map((m) => {
            const modelId = getModelUniqId(m)
            const selectionCount = mentionModelCounts[modelId] || 0
            return {
              label: (
                <>
                  <ProviderName>{p.isSystem ? t(`provider.${p.id}`) : p.name}</ProviderName>
                  <span style={{ opacity: 0.8 }}> | {m.name}</span>
                </>
              ),
              description: <ModelTagsWithLabel model={m} showLabel={false} size={10} style={{ opacity: 0.8 }} />,
              icon: (
                <Avatar src={getModelLogo(m.id)} size={20}>
                  {first(m.name)}
                </Avatar>
              ),
              filterText: (p.isSystem ? t(`provider.${p.id}`) : p.name) + m.name,
              action: (options: QuickPanelCallBackOptions) => onMentionModel(m, { mode: options.mode || 'toggle' }),
              isSelected: selectionCount > 0,
              selectionCount
            }
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
          .filter((m) => !pinnedModels.includes(getModelUniqId(m))),
        ['group', 'name']
      )

      const providerModelItems = providerModels.map((m) => {
        const modelId = getModelUniqId(m)
        const selectionCount = mentionModelCounts[modelId] || 0
        return {
          label: (
            <>
              <ProviderName>{p.isSystem ? t(`provider.${p.id}`) : p.name}</ProviderName>
              <span style={{ opacity: 0.8 }}> | {m.name}</span>
            </>
          ),
          description: <ModelTagsWithLabel model={m} showLabel={false} size={10} style={{ opacity: 0.8 }} />,
          icon: (
            <Avatar src={getModelLogo(m.id)} size={20}>
              {first(m.name)}
            </Avatar>
          ),
          filterText: (p.isSystem ? t(`provider.${p.id}`) : p.name) + m.name,
          action: (options: QuickPanelCallBackOptions) => onMentionModel(m, { mode: options.mode || 'toggle' }),
          isSelected: selectionCount > 0,
          selectionCount
        }
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

    return items
  }, [providers, t, pinnedModels, mentionModels, onMentionModel, navigate])

  const openQuickPanel = useCallback(() => {
    quickPanel.open({
      title: t('agents.edit.model.select.title'),
      list: modelItems,
      symbol: '@',
      multiple: true,
      multipleRepeat: true,
      afterAction({ item, mode }) {
        if (mode === 'add') {
          item.selectionCount = (item.selectionCount || 0) + 1
        } else {
          item.selectionCount = item.selectionCount ? 0 : 1
        }
        item.isSelected = !!item.selectionCount
      }
    })
  }, [modelItems, quickPanel, t])

  const handleOpenQuickPanel = useCallback(() => {
    if (quickPanel.isVisible && quickPanel.symbol === '@') {
      quickPanel.close()
    } else {
      openQuickPanel()
    }
  }, [openQuickPanel, quickPanel])

  useImperativeHandle(ref, () => ({
    openQuickPanel
  }))

  return (
    <Tooltip placement="top" title={t('agents.edit.model.select.title')} arrow>
      <ToolbarButton type="text" onClick={handleOpenQuickPanel}>
        <AtSign size={18} />
      </ToolbarButton>
    </Tooltip>
  )
}

const ProviderName = styled.span`
  font-weight: 500;
`

export default memo(MentionModelsButton)
