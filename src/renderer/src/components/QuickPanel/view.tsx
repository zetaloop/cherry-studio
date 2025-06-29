import { RightOutlined } from '@ant-design/icons'
import { isMac } from '@renderer/config/constant'
import useUserTheme from '@renderer/hooks/useUserTheme'
import { classNames } from '@renderer/utils'
import { Flex } from 'antd'
import { t } from 'i18next'
import { Check } from 'lucide-react'
import React, { use, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FixedSizeList } from 'react-window'
import styled from 'styled-components'
import * as tinyPinyin from 'tiny-pinyin'

import { QuickPanelContext } from './provider'
import {
  QuickPanelCallBackOptions,
  QuickPanelCloseAction,
  QuickPanelListItem,
  QuickPanelOpenOptions,
  QuickPanelScrollTrigger
} from './types'

const ITEM_HEIGHT = 31

interface Props {
  setInputText: React.Dispatch<React.SetStateAction<string>>
}

/**
 * @description 快捷面板内容视图;
 * 请不要往这里添加入参，避免耦合;
 * 这里只读取来自上下文QuickPanelContext的数据
 *
 * 无奈之举，为了清除输入框搜索文本，所以传了个setInputText进来
 */
export const QuickPanelView: React.FC<Props> = ({ setInputText }) => {
  const ctx = use(QuickPanelContext)

  if (!ctx) {
    throw new Error('QuickPanel must be used within a QuickPanelProvider')
  }

  const { colorPrimary } = useUserTheme()
  const selectedColor = colorPrimary.alpha(0.15).toString()
  const selectedColorHover = colorPrimary.alpha(0.2).toString()

  const ASSISTIVE_KEY = isMac ? '⌘' : 'Ctrl'
  const [isAssistiveKeyPressed, setIsAssistiveKeyPressed] = useState(false)

  // 避免上下翻页时，鼠标干扰
  const [isMouseOver, setIsMouseOver] = useState(false)

  const scrollTriggerRef = useRef<QuickPanelScrollTrigger>('initial')
  const [_index, setIndex] = useState(ctx.defaultIndex)
  const index = useDeferredValue(_index)
  const [historyPanel, setHistoryPanel] = useState<QuickPanelOpenOptions[]>([])

  const bodyRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<FixedSizeList>(null)
  const footerRef = useRef<HTMLDivElement>(null)

  const [_searchText, setSearchText] = useState('')
  const searchText = useDeferredValue(_searchText)
  const searchTextRef = useRef('')

  // 处理搜索，过滤列表
  const list = useMemo(() => {
    if (!ctx.isVisible && !ctx.symbol) return []
    const newList = ctx.list?.filter((item) => {
      const _searchText = searchText.replace(/^[/@]/, '')
      if (!_searchText) return true

      let filterText = item.filterText || ''
      if (typeof item.label === 'string') {
        filterText += item.label
      }
      if (typeof item.description === 'string') {
        filterText += item.description
      }

      const lowerFilterText = filterText.toLowerCase()
      const lowerSearchText = _searchText.toLowerCase()

      if (lowerFilterText.includes(lowerSearchText)) {
        return true
      }

      const pattern = lowerSearchText
        .split('')
        .map((char) => {
          return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        })
        .join('.*')
      if (tinyPinyin.isSupported() && /[\u4e00-\u9fa5]/.test(filterText)) {
        try {
          const pinyinText = tinyPinyin.convertToPinyin(filterText, '', true).toLowerCase()
          const regex = new RegExp(pattern, 'ig')
          return regex.test(pinyinText)
        } catch (error) {
          return true
        }
      } else {
        const regex = new RegExp(pattern, 'ig')
        return regex.test(filterText.toLowerCase())
      }
    })

    setIndex(newList.length > 0 ? ctx.defaultIndex || 0 : -1)

    return newList
  }, [ctx.defaultIndex, ctx.isVisible, ctx.list, ctx.symbol, searchText])

  const canForwardAndBackward = useMemo(() => {
    return list.some((item) => item.isMenu) || historyPanel.length > 0
  }, [list, historyPanel])

  const clearSearchText = useCallback(
    (includeSymbol = false) => {
      const textArea = document.querySelector('.inputbar textarea') as HTMLTextAreaElement
      const cursorPosition = textArea.selectionStart ?? 0
      const prevChar = textArea.value[cursorPosition - 1]
      if ((prevChar === '/' || prevChar === '@') && !searchTextRef.current) {
        searchTextRef.current = prevChar
      }

      const _searchText = includeSymbol ? searchTextRef.current : searchTextRef.current.replace(/^[/@]/, '')
      if (!_searchText) return

      const inputText = textArea.value
      let newText = inputText
      const searchPattern = new RegExp(`${_searchText}$`)

      const match = inputText.slice(0, cursorPosition).match(searchPattern)
      if (match) {
        const start = match.index || 0
        const end = start + match[0].length
        newText = inputText.slice(0, start) + inputText.slice(end)
        setInputText(newText)

        setTimeout(() => {
          textArea.focus()
          textArea.setSelectionRange(start, start)
        }, 0)
      }
      setSearchText('')
    },
    [setInputText]
  )

  const handleClose = useCallback(
    (action?: QuickPanelCloseAction) => {
      ctx.close(action)
      setHistoryPanel([])
      scrollTriggerRef.current = 'initial'

      if (action === 'delete-symbol') {
        const textArea = document.querySelector('.inputbar textarea') as HTMLTextAreaElement
        if (textArea) {
          setInputText(textArea.value)
        }
      } else if (action && !['outsideclick', 'esc', 'enter_empty'].includes(action)) {
        clearSearchText(true)
      }
    },
    [ctx, clearSearchText, setInputText]
  )

  const handleItemAction = useCallback(
    (item: QuickPanelListItem, action?: QuickPanelCloseAction, event?: React.MouseEvent | KeyboardEvent) => {
      if (item.disabled) return

      const isShiftPressed = event?.shiftKey
      const mode = isShiftPressed ? 'add' : 'toggle'

      const quickPanelCallBackOptions: QuickPanelCallBackOptions = {
        symbol: ctx.symbol,
        action,
        item,
        searchText: searchText,
        multiple: isAssistiveKeyPressed,
        mode
      }

      ctx.beforeAction?.(quickPanelCallBackOptions)
      item?.action?.(quickPanelCallBackOptions)
      ctx.afterAction?.(quickPanelCallBackOptions)

      if (item.isMenu) {
        // 保存上一个打开的选项，用于回退
        setHistoryPanel((prev) => [
          ...(prev || []),
          {
            title: ctx.title,
            list: ctx.list,
            symbol: ctx.symbol,
            multiple: ctx.multiple,
            defaultIndex: index,
            pageSize: ctx.pageSize,
            onClose: ctx.onClose,
            beforeAction: ctx.beforeAction,
            afterAction: ctx.afterAction
          }
        ])
        clearSearchText(false)
        return
      }

      if (ctx.multiple && (isAssistiveKeyPressed || isShiftPressed)) return

      handleClose(action)
    },
    [ctx, searchText, isAssistiveKeyPressed, handleClose, clearSearchText, index]
  )

  useEffect(() => {
    searchTextRef.current = searchText
  }, [searchText])

  // 获取当前输入的搜索词
  const isComposing = useRef(false)
  useEffect(() => {
    if (!ctx.isVisible) return

    const textArea = document.querySelector('.inputbar textarea') as HTMLTextAreaElement

    const handleInput = (e: Event) => {
      if (isComposing.current) return

      const target = e.target as HTMLTextAreaElement
      const cursorPosition = target.selectionStart
      const textBeforeCursor = target.value.slice(0, cursorPosition)
      const lastSlashIndex = textBeforeCursor.lastIndexOf('/')
      const lastAtIndex = textBeforeCursor.lastIndexOf('@')
      const lastSymbolIndex = Math.max(lastSlashIndex, lastAtIndex)

      if (lastSymbolIndex !== -1) {
        const newSearchText = textBeforeCursor.slice(lastSymbolIndex)
        setSearchText(newSearchText)
      } else {
        handleClose('delete-symbol')
      }
    }

    const handleCompositionUpdate = () => {
      isComposing.current = true
    }

    const handleCompositionEnd = (e: CompositionEvent) => {
      isComposing.current = false
      handleInput(e)
    }

    textArea.addEventListener('input', handleInput)
    textArea.addEventListener('compositionupdate', handleCompositionUpdate)
    textArea.addEventListener('compositionend', handleCompositionEnd)

    return () => {
      textArea.removeEventListener('input', handleInput)
      textArea.removeEventListener('compositionupdate', handleCompositionUpdate)
      textArea.removeEventListener('compositionend', handleCompositionEnd)
      setTimeout(() => {
        setSearchText('')
      }, 200) // 等待面板关闭动画结束后，再清空搜索词
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.isVisible])

  useLayoutEffect(() => {
    if (!listRef.current || index < 0 || scrollTriggerRef.current === 'none') return

    const alignment = scrollTriggerRef.current === 'keyboard' ? 'auto' : 'smart'
    listRef.current?.scrollToItem(index, alignment)

    scrollTriggerRef.current = 'none'
  }, [index])

  // 处理键盘事件
  useEffect(() => {
    if (!ctx.isVisible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isMac ? e.metaKey : e.ctrlKey) {
        setIsAssistiveKeyPressed(true)
      }

      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Escape'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        setIsMouseOver(false)
      }
      if (['ArrowLeft', 'ArrowRight'].includes(e.key) && isAssistiveKeyPressed) {
        e.preventDefault()
        e.stopPropagation()
        setIsMouseOver(false)
      }

      switch (e.key) {
        case 'ArrowUp':
          scrollTriggerRef.current = 'keyboard'
          if (isAssistiveKeyPressed) {
            setIndex((prev) => {
              const newIndex = prev - ctx.pageSize
              if (prev === 0) return list.length - 1
              return newIndex < 0 ? 0 : newIndex
            })
          } else {
            setIndex((prev) => (prev > 0 ? prev - 1 : list.length - 1))
          }
          break

        case 'ArrowDown':
          scrollTriggerRef.current = 'keyboard'
          if (isAssistiveKeyPressed) {
            setIndex((prev) => {
              const newIndex = prev + ctx.pageSize
              if (prev + 1 === list.length) return 0
              return newIndex >= list.length ? list.length - 1 : newIndex
            })
          } else {
            setIndex((prev) => (prev < list.length - 1 ? prev + 1 : 0))
          }
          break

        case 'PageUp':
          scrollTriggerRef.current = 'keyboard'
          setIndex((prev) => {
            const newIndex = prev - ctx.pageSize
            return newIndex < 0 ? 0 : newIndex
          })
          break

        case 'PageDown':
          scrollTriggerRef.current = 'keyboard'
          setIndex((prev) => {
            const newIndex = prev + ctx.pageSize
            return newIndex >= list.length ? list.length - 1 : newIndex
          })
          break

        case 'ArrowLeft':
          if (!isAssistiveKeyPressed) return
          if (!historyPanel.length) return
          scrollTriggerRef.current = 'initial'
          clearSearchText(false)
          if (historyPanel.length > 0) {
            const lastPanel = historyPanel.pop()
            if (lastPanel) {
              ctx.open(lastPanel)
            }
          }
          break

        case 'ArrowRight':
          if (!isAssistiveKeyPressed) return
          if (!list?.[index]?.isMenu) return
          scrollTriggerRef.current = 'initial'
          clearSearchText(false)
          handleItemAction(list[index], 'enter')
          break

        case 'Enter':
        case 'NumpadEnter':
          if (isComposing.current) return

          if (list?.[index]) {
            e.preventDefault()
            e.stopPropagation()
            setIsMouseOver(false)

            handleItemAction(list[index], 'enter', e)
          } else {
            handleClose('enter_empty')
          }
          break
        case 'Escape':
          handleClose('esc')
          break
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isMac ? !e.metaKey : !e.ctrlKey) {
        setIsAssistiveKeyPressed(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('#inputbar')) return
      if (bodyRef.current && !bodyRef.current.contains(target)) {
        handleClose('outsideclick')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('click', handleClickOutside)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('click', handleClickOutside)
    }
  }, [index, isAssistiveKeyPressed, historyPanel, ctx, list, handleItemAction, handleClose, clearSearchText])

  const [footerWidth, setFooterWidth] = useState(0)

  useEffect(() => {
    if (!footerRef.current || !ctx.isVisible) return
    const footerWidth = footerRef.current.clientWidth
    setFooterWidth(footerWidth)

    const handleResize = () => {
      const footerWidth = footerRef.current!.clientWidth
      setFooterWidth(footerWidth)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [ctx.isVisible])

  const listHeight = useMemo(() => {
    return Math.min(ctx.pageSize, list.length) * ITEM_HEIGHT
  }, [ctx.pageSize, list.length])

  const RowData = useMemo(
    (): VirtualizedRowData => ({
      list,
      focusedIndex: index,
      handleItemAction,
      setIndex
    }),
    [list, index, handleItemAction, setIndex]
  )

  return (
    <QuickPanelContainer
      $pageSize={ctx.pageSize}
      $selectedColor={selectedColor}
      $selectedColorHover={selectedColorHover}
      className={ctx.isVisible ? 'visible' : ''}
      data-testid="quick-panel">
      <QuickPanelBody
        ref={bodyRef}
        onMouseMove={() =>
          setIsMouseOver((prev) => {
            scrollTriggerRef.current = 'initial'
            return prev ? prev : true
          })
        }>
        <FixedSizeList
          ref={listRef}
          itemCount={list.length}
          itemSize={ITEM_HEIGHT}
          itemData={RowData}
          height={listHeight}
          width="100%"
          overscanCount={4}
          style={{
            pointerEvents: isMouseOver ? 'auto' : 'none'
          }}>
          {VirtualizedRow}
        </FixedSizeList>
        <QuickPanelFooter ref={footerRef}>
          <QuickPanelFooterTitle>{ctx.title || ''}</QuickPanelFooterTitle>
          <QuickPanelFooterTips $footerWidth={footerWidth}>
            <span>ESC {t('settings.quickPanel.close')}</span>

            <Flex align="center" gap={4}>
              ▲▼ {t('settings.quickPanel.select')}
            </Flex>

            {footerWidth >= 500 && (
              <>
                <Flex align="center" gap={4}>
                  <span style={{ color: isAssistiveKeyPressed ? 'var(--color-primary)' : 'var(--color-text-3)' }}>
                    {ASSISTIVE_KEY}
                  </span>
                  + ▲▼ {t('settings.quickPanel.page')}
                </Flex>

                {canForwardAndBackward && (
                  <Flex align="center" gap={4}>
                    <span style={{ color: isAssistiveKeyPressed ? 'var(--color-primary)' : 'var(--color-text-3)' }}>
                      {ASSISTIVE_KEY}
                    </span>
                    + ◀︎▶︎ {t('settings.quickPanel.back')}/{t('settings.quickPanel.forward')}
                  </Flex>
                )}
              </>
            )}

            <Flex align="center" gap={4}>
              ↩︎ {t('settings.quickPanel.confirm')}
            </Flex>

            {ctx.multiple && (
              <Flex align="center" gap={4}>
                <span style={{ color: isAssistiveKeyPressed ? 'var(--color-primary)' : 'var(--color-text-3)' }}>
                  {ASSISTIVE_KEY}
                </span>
                + ↩︎ {t('settings.quickPanel.multiple')}
              </Flex>
            )}
            {ctx.multipleRepeat && (
              <Flex align="center" gap={4}>
                <span style={{ color: 'var(--color-text-3)' }}>⇧</span>+
                <span style={{ color: isAssistiveKeyPressed ? 'var(--color-primary)' : 'var(--color-text-3)' }}>
                  {ASSISTIVE_KEY}
                </span>
                + ↩︎ {t('settings.quickPanel.multiple_repeat')}
              </Flex>
            )}
          </QuickPanelFooterTips>
        </QuickPanelFooter>
      </QuickPanelBody>
    </QuickPanelContainer>
  )
}

interface VirtualizedRowData {
  list: QuickPanelListItem[]
  focusedIndex: number
  handleItemAction: (item: QuickPanelListItem, action?: QuickPanelCloseAction, event?: React.MouseEvent) => void
  setIndex: (index: number) => void
}

/**
 * 虚拟化列表行组件，用于避免重新渲染
 */
const VirtualizedRow = React.memo(
  ({ data, index, style }: { data: VirtualizedRowData; index: number; style: React.CSSProperties }) => {
    const { list, focusedIndex, handleItemAction, setIndex } = data
    const item = list[index]
    if (!item) return null

    return (
      <div style={style}>
        <QuickPanelItem
          className={classNames({
            focused: index === focusedIndex,
            selected: item.isSelected,
            disabled: item.disabled
          })}
          data-id={index}
          onClick={(e) => {
            e.stopPropagation()
            handleItemAction(item, 'click', e)
          }}
          onMouseEnter={() => setIndex(index)}>
          <QuickPanelItemLeft>
            <QuickPanelItemIcon>{item.icon}</QuickPanelItemIcon>
            <QuickPanelItemLabel>{item.label}</QuickPanelItemLabel>
          </QuickPanelItemLeft>

          <QuickPanelItemRight>
            {item.description && <QuickPanelItemDescription>{item.description}</QuickPanelItemDescription>}
            <QuickPanelItemSuffixIcon>
              {item.suffix ? (
                item.suffix
              ) : item.selectionCount && item.selectionCount > 1 ? (
                <CountBadge>x{item.selectionCount}</CountBadge>
              ) : item.isSelected ? (
                <Check />
              ) : (
                item.isMenu && !item.disabled && <RightOutlined />
              )}
            </QuickPanelItemSuffixIcon>
          </QuickPanelItemRight>
        </QuickPanelItem>
      </div>
    )
  }
)

const QuickPanelContainer = styled.div<{
  $pageSize: number
  $selectedColor: string
  $selectedColorHover: string
}>`
  --focused-color: rgba(0, 0, 0, 0.06);
  --selected-color: ${(props) => props.$selectedColor};
  --selected-color-dark: ${(props) => props.$selectedColorHover};
  max-height: 0;
  position: absolute;
  top: 1px;
  left: 0;
  right: 0;
  width: 100%;
  padding: 0 30px 0 30px;
  transform: translateY(-100%);
  transform-origin: bottom;
  transition: max-height 0.2s ease;
  overflow: hidden;
  pointer-events: none;

  &.visible {
    pointer-events: auto;
    max-height: ${(props) => props.$pageSize * ITEM_HEIGHT + 100}px;
  }
  body[theme-mode='dark'] & {
    --focused-color: rgba(255, 255, 255, 0.1);
  }
`

const QuickPanelBody = styled.div`
  border-radius: 8px 8px 0 0;
  padding: 5px 0;
  border-width: 0.5px 0.5px 0 0.5px;
  border-style: solid;
  border-color: var(--color-border);
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-color: rgba(240, 240, 240, 0.5);
    backdrop-filter: blur(35px) saturate(150%);
    z-index: -1;
    border-radius: inherit;

    body[theme-mode='dark'] & {
      background-color: rgba(40, 40, 40, 0.4);
    }
  }

  ::-webkit-scrollbar {
    width: 3px;
  }
`

const QuickPanelFooter = styled.div`
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 8px 12px 5px;
`

const QuickPanelFooterTips = styled.div<{ $footerWidth: number }>`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 16px;
  font-size: 12px;
  color: var(--color-text-3);
`

const QuickPanelFooterTitle = styled.div`
  font-size: 12px;
  color: var(--color-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const QuickPanelItem = styled.div`
  height: 30px;
  display: flex;
  align-items: center;
  gap: 20px;
  justify-content: space-between;
  margin: 0 5px 1px 5px;
  padding: 5px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.1s ease;
  &.selected {
    background-color: var(--selected-color);
    &.focused {
      background-color: var(--selected-color-dark);
    }
  }
  &.focused {
    background-color: var(--focused-color);
  }
  &.disabled {
    --selected-color: rgba(0, 0, 0, 0.02);
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const QuickPanelItemLeft = styled.div`
  max-width: 60%;
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  flex-shrink: 0;
`

const QuickPanelItemIcon = styled.span`
  font-size: 13px;
  color: var(--color-text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  > svg {
    width: 1em;
    height: 1em;
    color: var(--color-text-3);
  }
`

const CountBadge = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: var(--color-primary);
`

const QuickPanelItemLabel = styled.span`
  flex: 1;
  font-size: 13px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
`

const QuickPanelItemRight = styled.div`
  min-width: 20%;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  color: var(--color-text-3);
`

const QuickPanelItemDescription = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const QuickPanelItemSuffixIcon = styled.span`
  min-width: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  > svg {
    width: 1em;
    height: 1em;
    color: var(--color-text-3);
  }
`
