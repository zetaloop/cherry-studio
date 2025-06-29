import CustomTag from '@renderer/components/CustomTag'
import { useProviders } from '@renderer/hooks/useProvider'
import { getModelUniqId } from '@renderer/services/ModelService'
import { Model } from '@renderer/types'
import { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const MentionModelsInput: FC<{
  selectedModels: Model[]
  onRemoveModel: (model: Model) => void
}> = ({ selectedModels, onRemoveModel }) => {
  const { providers } = useProviders()
  const { t } = useTranslation()

  const getProviderName = (model: Model) => {
    const provider = providers.find((p) => p.id === model?.provider)
    return provider ? (provider.isSystem ? t(`provider.${provider.id}`) : provider.name) : ''
  }

  const groupedModels = useMemo(() => {
    const counts: Record<string, { model: Model; count: number }> = {}
    for (const model of selectedModels) {
      const modelId = getModelUniqId(model)
      if (counts[modelId]) {
        counts[modelId].count++
      } else {
        counts[modelId] = { model, count: 1 }
      }
    }
    return Object.values(counts)
  }, [selectedModels])

  return (
    <Container>
      {groupedModels.map(({ model, count }) => (
        <CustomTag
          icon={<i className="iconfont icon-at" />}
          color="#1677ff"
          key={getModelUniqId(model)}
          closable
          onClose={() => onRemoveModel(model)}>
          {model.name} ({getProviderName(model)}) {count > 1 && `x${count}`}
        </CustomTag>
      ))}
    </Container>
  )
}

const Container = styled.div`
  width: 100%;
  padding: 5px 15px 5px 15px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 4px;
`

export default MentionModelsInput
