import HorizontalScrollContainer from '@renderer/components/HorizontalScrollContainer'
import CustomTag from '@renderer/components/Tags/CustomTag'
import { useProviders } from '@renderer/hooks/useProvider'
import { getModelUniqId } from '@renderer/services/ModelService'
import type { Model } from '@renderer/types'
import { getFancyProviderName } from '@renderer/utils'
import { type FC, useMemo } from 'react'
import styled from 'styled-components'

const MentionModelsInput: FC<{
  selectedModels: Model[]
  onRemoveModel: (model: Model) => void
}> = ({ selectedModels, onRemoveModel }) => {
  const { providers } = useProviders()

  const getProviderName = (model: Model) => {
    const provider = providers.find((p) => p.id === model?.provider)
    return provider ? getFancyProviderName(provider) : ''
  }

  // 合并相同模型，计算数量
  const groupedModels = useMemo(() => {
    const groups = new Map<string, { model: Model; count: number }>()
    selectedModels.forEach((model) => {
      const id = getModelUniqId(model)
      const existing = groups.get(id)
      if (existing) {
        existing.count++
      } else {
        groups.set(id, { model, count: 1 })
      }
    })
    return Array.from(groups.values())
  }, [selectedModels])

  return (
    <Container>
      <HorizontalScrollContainer dependencies={[selectedModels]} expandable>
        {groupedModels.map(({ model, count }) => (
          <CustomTag
            icon={<i className="iconfont icon-at" />}
            color="#1677ff"
            key={getModelUniqId(model)}
            closable
            onClose={() => onRemoveModel(model)}>
            {model.name} ({getProviderName(model)}){count > 1 && <CountBadge>×{count}</CountBadge>}
          </CustomTag>
        ))}
      </HorizontalScrollContainer>
    </Container>
  )
}

const Container = styled.div`
  width: 100%;
  padding: 5px 15px 5px 15px;
`

const CountBadge = styled.span`
  margin-left: 4px;
  font-weight: 500;
`

export default MentionModelsInput
