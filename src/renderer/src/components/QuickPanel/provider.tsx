import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  QuickPanelCallBackOptions,
  QuickPanelCloseAction,
  QuickPanelContextType,
  QuickPanelListItem,
  QuickPanelOpenOptions,
  QuickPanelTriggerInfo
} from './types'

const QuickPanelContext = createContext<QuickPanelContextType | null>(null)

export const QuickPanelProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [symbol, setSymbol] = useState<string>('')

  const [list, setList] = useState<QuickPanelListItem[]>([])
  const [title, setTitle] = useState<string | undefined>()
  const [defaultIndex, setDefaultIndex] = useState<number>(0)
  const [pageSize, setPageSize] = useState<number>(7)
  const [multiple, setMultiple] = useState<boolean>(false)
  const [multipleRepeat, setMultipleRepeat] = useState<boolean>(false)
  const [triggerInfo, setTriggerInfo] = useState<QuickPanelTriggerInfo | undefined>()
  const [onClose, setOnClose] = useState<((Options: Partial<QuickPanelCallBackOptions>) => void) | undefined>()
  const [beforeAction, setBeforeAction] = useState<((Options: QuickPanelCallBackOptions) => void) | undefined>()
  const [afterAction, setAfterAction] = useState<((Options: QuickPanelCallBackOptions) => void) | undefined>()

  const clearTimer = useRef<NodeJS.Timeout | null>(null)

  // 添加更新item选中状态的方法
  const updateItemSelection = useCallback((targetItem: QuickPanelListItem, isSelected: boolean) => {
    setList((prevList) => prevList.map((item) => (item === targetItem ? { ...item, isSelected } : item)))
  }, [])

  // 通用：更新指定项的任意字段
  const updateItem = useCallback(
    (targetItem: QuickPanelListItem, updater: (prev: QuickPanelListItem) => QuickPanelListItem) => {
      setList((prevList) => prevList.map((item) => (item === targetItem ? updater(item) : item)))
    },
    []
  )

  const open = useCallback((options: QuickPanelOpenOptions) => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current)
      clearTimer.current = null
    }

    setTitle(options.title)
    setList(options.list)
    setDefaultIndex(options.defaultIndex ?? 0)
    setPageSize(options.pageSize ?? 7)
    setMultiple(options.multiple ?? false)
    setMultipleRepeat(options.multipleRepeat ?? false)
    setSymbol(options.symbol)
    setTriggerInfo(options.triggerInfo)

    setOnClose(() => options.onClose)
    setBeforeAction(() => options.beforeAction)
    setAfterAction(() => options.afterAction)

    setIsVisible(true)
  }, [])

  const close = useCallback(
    (action?: QuickPanelCloseAction, searchText?: string) => {
      setIsVisible(false)
      onClose?.({ symbol, action, triggerInfo, searchText, item: {} as QuickPanelListItem, multiple: false })

      clearTimer.current = setTimeout(() => {
        setList([])
        setOnClose(undefined)
        setBeforeAction(undefined)
        setAfterAction(undefined)
        setTitle(undefined)
        setSymbol('')
        setTriggerInfo(undefined)
      }, 200)
    },
    [onClose, symbol, triggerInfo]
  )

  useEffect(() => {
    return () => {
      if (clearTimer.current) {
        clearTimeout(clearTimer.current)
        clearTimer.current = null
      }
    }
  }, [])

  const value = useMemo(
    () => ({
      open,
      close,
      updateItemSelection,
      updateItem,

      isVisible,
      symbol,

      list,
      title,
      defaultIndex,
      pageSize,
      multiple,
      multipleRepeat,
      triggerInfo,
      onClose,
      beforeAction,
      afterAction
    }),
    [
      open,
      close,
      updateItemSelection,
      updateItem,
      isVisible,
      symbol,
      list,
      title,
      defaultIndex,
      pageSize,
      multiple,
      multipleRepeat,
      triggerInfo,
      onClose,
      beforeAction,
      afterAction
    ]
  )

  return <QuickPanelContext value={value}>{children}</QuickPanelContext>
}

export { QuickPanelContext }
