import React, {
  useEffect,
  useRef,
  useState,
  ReactElement,
  Children,
  forwardRef,
  useContext,
  isValidElement,
  useImperativeHandle,
} from 'react'
import { createPopper, Instance, Modifier, Placement } from '@popperjs/core'
import { tuple } from '../_utils/type'
import classnames from 'classnames'
import debounce from 'lodash/debounce'
import ReactDOM from 'react-dom'
import { isFragment } from '../_utils/reactNode'
import { ConfigContext } from '../config-provider'
import { useMergedState } from '../_utils/hooks'
import useId from '../_utils/useId'

export const Placements = tuple(
  'top',
  'left',
  'right',
  'bottom',
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight',
  'leftTop',
  'leftBottom',
  'rightTop',
  'rightBottom',
)

export type PlacementType = typeof Placements[number]

export const Triggers = tuple('hover', 'focus', 'click', 'contextMenu')

export type TriggerType = typeof Triggers[number]

export type Reason = TriggerType | 'scroll' | 'clickOutside' | 'clickToClose' | 'parentHidden' | 'unknown'

export type RenderFunction = () => React.ReactNode

export type PopperProps = {
  gap?: number
  arrow?: boolean
  visible?: boolean
  prefixCls?: string
  arrowSize?: number
  disabled?: boolean
  arrowOffset?: number
  scrollHidden?: boolean
  mouseEnterDelay?: number
  mouseLeaveDelay?: number
  defaultVisible?: boolean
  autoPlacement?: boolean
  autoPlacementList?: Placement[]
  className?: string
  style?: React.CSSProperties
  popperClassName?: string
  popperStyle?: React.CSSProperties
  popperOuterClassName?: string
  popperOuterStyle?: React.CSSProperties
  placement?: PlacementType
  tip?: any
  trigger?: TriggerType | Array<TriggerType>
  strategy?: 'fixed' | 'absolute'
  clickToClose?: boolean
  onTrigger?: (trigger: TriggerType) => void
  onVisibleChange?: (visible: boolean, reason?: Reason) => void
  getTriggerElement?: (locatorNode: HTMLElement) => HTMLElement
  getPopupContainer?: (locatorNode: HTMLElement) => HTMLElement
  onTransitionEnd?: (e: React.TransitionEvent) => void
  onAnimationEnd?: (e: React.AnimationEvent) => void
  children?: React.ReactNode
  customerModifiers?: (modifiers: Partial<Modifier<any, any>>[]) => Partial<Modifier<any, any>>[]
}

const useEnhancedEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

export interface TriggerContextProps {
  registerSubPopup: (id: string, node: any) => void
}

const TriggerContext = React.createContext<TriggerContextProps | null>(null)

const generateGetBoundingClientRect = (x = 0, y = 0, width = 0, height = 0) => {
  return () => ({
    width,
    height,
    top: y,
    right: x,
    bottom: y,
    left: x,
  })
}

const virtualElement = {
  getBoundingClientRect: generateGetBoundingClientRect(),
}

const triggerTypeArray = ['hover', 'focus', 'click', 'contextMenu']

export const popperPlacementMap = {
  top: 'top',
  left: 'left',
  right: 'right',
  bottom: 'bottom',
  topLeft: 'top-start',
  topRight: 'top-end',
  bottomLeft: 'bottom-start',
  bottomRight: 'bottom-end',
  leftTop: 'left-start',
  leftBottom: 'left-end',
  rightTop: 'right-start',
  rightBottom: 'right-end',
}

const getRealPlacement = (key: PlacementType) => {
  return popperPlacementMap[key] ? (popperPlacementMap[key] as Placement) : 'top'
}

const getFallbackPlacementList: (arr: string[]) => Placement[] = (arr) => {
  return arr
    .map((d) => {
      return popperPlacementMap[d as PlacementType] ? popperPlacementMap[d as PlacementType] : ''
    })
    .filter((d) => d) as Placement[]
}

const getRealDom = (locatorRef: any, locatorElement: any = undefined) => {
  if (!locatorRef.current) return locatorRef.current
  if (locatorRef.current.tagName) return locatorRef.current
  if (locatorElement) {
    const REF_NAME_OBJ: any = {
      Input: 'input',
      InputNumber: 'input',
      Select: 'select',
      Upload: 'input',
    }
    const name = REF_NAME_OBJ?.[locatorElement?.type?.displayName]
    return locatorRef?.current[name]
  }
  return locatorElement
}

const getElement = (element: any) => {
  return typeof element === 'function' ? element() : element
}

export const Popper = forwardRef<unknown, PopperProps>((props, ref) => {
  const { getPrefixCls, prefixCls: pkgPrefixCls } = React.useContext(ConfigContext)
  const {
    prefixCls,
    onTrigger,
    style,
    popperStyle,
    arrow = false,
    onVisibleChange,
    className,
    popperClassName,
    popperOuterClassName,
    popperOuterStyle,
    tip,
    disabled = false,
    trigger = 'click',
    placement = 'top',
    strategy = 'absolute',
    visible,
    arrowSize = 4.25,
    arrowOffset = 12,
    gap: defaultGap = 8,
    scrollHidden = false,
    mouseEnterDelay = 0.1,
    mouseLeaveDelay = 0.1,
    defaultVisible = false,
    autoPlacement = true,
    autoPlacementList,
    clickToClose = true,
    getTriggerElement = (locatorNode) => locatorNode,
    getPopupContainer = () => document.body,
    onTransitionEnd,
    onAnimationEnd,
    children,
    customerModifiers,
  } = props

  const popperPrefixCls = getPrefixCls!(pkgPrefixCls, 'popper')
  const referencePrefixCls = `${popperPrefixCls}-reference`
  const child: any = getElement(children)
  const childrenInner = isValidElement(child) && !isFragment(child) ? child : <span>{child}</span>
  const popperElement = getElement(tip)
  const referenceElement: any = Children.only(childrenInner) as ReactElement

  const arrowOffsetInner = arrowSize + arrowOffset
  const getArrowOffset = (popperSize: number, referenceSize: number, arr: string[]) => {
    const boundary = arrowOffsetInner * 2
    let offset: any

    if (referenceSize < boundary || popperSize < boundary) {
      const o = Math.min(referenceSize, popperSize) / 2
      if (arr[1] === 'start') {
        offset = o
      } else {
        offset = Math.max(popperSize - o, 0)
      }
    } else {
      if (arr[1] === 'start') {
        offset = arrowOffsetInner
      } else {
        offset = popperSize - arrowOffsetInner
      }
    }

    return offset
  }
  const id = useId()
  const parentContext = useContext(TriggerContext)
  const subPopupRefs = useRef<Record<string, any>>({})
  const context = React.useMemo<TriggerContextProps>(() => {
    return {
      registerSubPopup: (id, subPopupEle) => {
        subPopupRefs.current[id] = subPopupEle

        parentContext?.registerSubPopup(id, subPopupEle)
      },
    }
  }, [parentContext])

  const popperRefDom = useRef<any>(null)
  const popperRefInner = useRef<any>(null)
  const popperRef: any = ref || popperRefInner

  const popperInstance = useRef<Instance | null>(null)
  const referenceRefInner = useRef<any>(null)
  const onVisibleChangeRef = useRef<PopperProps['onVisibleChange']>(onVisibleChange)

  const referenceRef = referenceElement?.ref || referenceRefInner
  const container = getPopupContainer(getRealDom(referenceRef, referenceElement) || document.body) || document.body

  const [visibleInner, setVisibleInner] = useMergedState<boolean>(false, {
    value: visible,
    defaultValue: defaultVisible,
  })
  const [exist, setExist] = useState<boolean>(visibleInner)
  const [placementInner, setPlacementInner] = useState<Placement>(getRealPlacement(placement))

  const delayRef = useRef<any>()
  const clearDelay = () => {
    if (typeof delayRef.current !== 'undefined') {
      clearTimeout(delayRef.current)
      delayRef.current = null
    }
  }
  const changeVisible = (nextOpen: boolean, triggerType: Reason = 'unknown') => {
    if (visibleInner !== nextOpen) {
      if (nextOpen && triggerTypeArray.includes(triggerType)) {
        onTrigger?.(triggerType as TriggerType)
      }
      if (typeof visible === 'undefined') {
        setVisibleInner(nextOpen)
      }
      onVisibleChangeRef.current?.(nextOpen, triggerType)
    }
    if (!nextOpen && Object.keys(subPopupRefs.current || {}).length) {
      Object.values(subPopupRefs.current).forEach((d: any) => {
        if (typeof d?.triggerOpen === 'function' && d?.visible) {
          d?.triggerOpen(false, 'parentHidden')
        }
      })
    }
  }
  const triggerOpen = (nextOpen: boolean, triggerType: Reason = 'unknown', delay = 0) => {
    clearDelay()
    if (!disabled) {
      if (delay === 0) {
        changeVisible(nextOpen, triggerType)
      } else {
        if (visibleInner !== nextOpen) {
          delayRef.current = setTimeout(() => {
            changeVisible(nextOpen, triggerType)
          }, delay * 1000)
        }
      }
    }
  }

  const isSubPopper = (event: MouseEvent) => {
    if (!event || !event?.target) {
      return false
    }

    // let targetElement: HTMLElement = event.target as HTMLElement
    // const POP_ATTR_NAME = 'data-popper-placement'
    // while (targetElement && targetElement !== document.documentElement) {
    //   if (targetElement?.getAttribute(POP_ATTR_NAME) && targetElement?.className.includes(popperPrefixCls)) {
    //     return true
    //   }
    //   targetElement = targetElement?.parentNode as HTMLElement
    // }

    const target: HTMLElement = event.target as HTMLElement
    if (subPopupRefs.current) {
      for (const key in subPopupRefs.current) {
        const { dom } = subPopupRefs.current[key]
        if (dom && (dom?.contains(target) || dom === target)) {
          return true
        }
      }
    }

    return false
  }

  const onTriggerInner = (nextOpen: boolean, triggerType: TriggerType, delay: undefined | number = undefined) => {
    triggerOpen(nextOpen, triggerType, delay)
  }

  const onClick = () => {
    if (clickToClose || !visibleInner) {
      onTriggerInner(!visibleInner, 'click')
    }
  }

  const onFocus = () => {
    onTriggerInner(true, 'focus')
  }

  const onBlur = () => {
    onTriggerInner(false, 'focus')
  }

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    let clientWidth = 0
    let clientHeight = 0
    if (arrow) {
      if (placementInner.startsWith('top') || placementInner.startsWith('bottom')) {
        if (!['top', 'bottom'].includes(placementInner)) {
          clientWidth = 6 * arrowSize
        }
      } else {
        if (!['right', 'left'].includes(placementInner)) {
          clientHeight = 6 * arrowSize
        }
      }
    }

    virtualElement.getBoundingClientRect = generateGetBoundingClientRect(
      e.clientX,
      e.clientY,
      clientWidth,
      clientHeight,
    )
    onTriggerInner(!visibleInner, 'contextMenu')
  }

  const onMouseOver = () => {
    onTriggerInner(true, 'hover', mouseEnterDelay)
  }

  const onMouseLeave = () => {
    onTriggerInner(false, 'hover', mouseLeaveDelay)
  }

  const onPopperAnimationEnd = (e: React.AnimationEvent | React.TransitionEvent) => {
    onAnimationEnd?.(e as React.AnimationEvent)
    onTransitionEnd?.(e as React.TransitionEvent)
  }

  const isTrigger = (triggerValue: TriggerType) => {
    return trigger === triggerValue || (Array.isArray(trigger) && trigger.includes(triggerValue))
  }

  const triggerEventHandle = (triggerNode: any, type = 'addEventListener') => {
    if (isTrigger('click')) {
      triggerNode?.[type]('click', onClick)
    }
    if (isTrigger('focus')) {
      triggerNode?.[type]('focus', onFocus)
      triggerNode?.[type]('blur', onBlur)
    }
    if (isTrigger('contextMenu')) {
      triggerNode?.[type]('contextmenu', onContextMenu)
    }
    if (isTrigger('hover')) {
      triggerNode?.[type]('mouseover', onMouseOver)
      triggerNode?.[type]('mouseleave', onMouseLeave)
    }
  }

  useEffect(() => {
    onVisibleChangeRef.current = onVisibleChange
  }, [onVisibleChange])

  useEffect(() => {
    setPlacementInner(getRealPlacement(placement))
  }, [placement])

  useEffect(() => {
    const scrollHandle = debounce((e: Event) => {
      if (visibleInner) {
        const isPopper = e.target === popperRefDom.current || popperRefDom.current?.contains?.(e.target)
        if (scrollHidden && !isPopper) {
          triggerOpen(false, 'scroll')
        }
      }
    }, 10)

    if (visibleInner) {
      document.addEventListener('scroll', scrollHandle, true)
    }

    return () => {
      document.removeEventListener('scroll', scrollHandle, true)
    }
  }, [visibleInner, scrollHidden, popperRefDom])

  useEffect(() => {
    const clickHandle = debounce(
      (e: MouseEvent) => {
        if (visibleInner) {
          const isPopper = popperRefDom.current
            ? popperRefDom.current === e.target || popperRefDom.current.contains?.(e.target)
            : false

          const domReference = getRealDom(referenceRef, referenceElement)
          const isReference = domReference ? domReference === e.target || domReference?.contains?.(e.target) : false
          const isTarget = isPopper || isReference
          if (!isTarget && !isSubPopper(e)) {
            triggerOpen(false, 'clickOutside', 0)
          }

          if (clickToClose && isReference && trigger !== 'focus') {
            triggerOpen(false, 'clickToClose', 0)
          }
        }
      },
      10,
      { leading: true },
    )

    if (visibleInner) {
      document.addEventListener('click', clickHandle, true)
    }

    return () => {
      document.removeEventListener('click', clickHandle, true)
    }
  }, [visibleInner, clickToClose, referenceRef, popperRefDom])

  useEffect(() => {
    const realDom = getRealDom(referenceRef, referenceElement)
    const triggerNode = getTriggerElement(realDom)

    triggerEventHandle(triggerNode)

    return () => {
      triggerEventHandle(triggerNode, 'removeEventListener')
    }
  }, [getTriggerElement, visibleInner, referenceElement, referenceRef, trigger])

  useImperativeHandle(popperRef, () => {
    return {
      dom: popperRefDom.current,
      triggerOpen,
      visible: visibleInner,
    }
  })

  const defaultModifiers: Partial<Modifier<any, any>>[] = [
    {
      name: 'offset',
      options: {
        offset: [0, defaultGap + (arrow ? 5 : 0)],
      },
    },
    {
      name: 'preventOverflow',
      enabled: autoPlacement && !placementInner.includes('-'),
      options: {
        mainAxis: true,
      },
    },
    {
      name: 'flip',
      enabled: autoPlacement,
      options: {
        fallbackPlacements: Array.isArray(autoPlacementList) ? getFallbackPlacementList(autoPlacementList) : undefined,
      },
    },
    {
      name: 'applyArrowOffset',
      enabled: true,
      phase: 'write',
      fn(data: any) {
        const {
          elements: { arrow },
          placement,
          rects: { popper, reference },
        } = data.state
        if (arrow) {
          const arr = placement.split('-')
          let offset: any
          if (arr.length === 2) {
            switch (arr[0]) {
              case 'bottom':
                offset = getArrowOffset(popper.width, reference.width, arr)
                if (offset) {
                  arrow.style.transform = `translate(${offset}px, 0px)`
                }
                break
              case 'left':
                offset = getArrowOffset(popper.height, reference.height, arr)
                if (offset) {
                  arrow.style.transform = `translate(0px, ${offset}px)`
                }
                break
              case 'right':
                offset = getArrowOffset(popper.height, reference.height, arr)
                if (offset) {
                  arrow.style.transform = `translate(0px, ${offset}px)`
                }
                break
              default:
                offset = getArrowOffset(popper.width, reference.width, arr)
                if (offset) {
                  arrow.style.transform = `translate(${offset}px, 0px)`
                }
                break
            }
          }
        }
      },
    },
    {
      name: 'onUpdate',
      enabled: true,
      phase: 'afterWrite',
      fn: (d) => {
        const { placement: p } = d?.state
        if (p !== placementInner) {
          setPlacementInner(p)
        }
      },
    },
  ]

  const popperModifiers =
    typeof customerModifiers === 'function' ? customerModifiers(defaultModifiers) : defaultModifiers

  const popperOptionsInner: any = {
    placement: placementInner,
    modifiers: popperModifiers,
    strategy,
  }

  useEnhancedEffect(() => {
    if (visibleInner) {
      if (!exist) {
        setExist(true)
      } else {
        if (popperInstance.current) {
          popperInstance.current?.setOptions((options) => ({
            ...options,
            ...popperOptionsInner,
          }))
          popperInstance.current?.forceUpdate()
        }
        setTimeout(() => {
          parentContext?.registerSubPopup(id, popperRef.current)
        }, 10)
      }
    }
  }, [visibleInner, placementInner, arrow])

  useEnhancedEffect(() => {
    if (!exist) {
      return undefined
    }

    const current = getRealDom(referenceRef, referenceElement)

    if (current) {
      popperInstance.current = createPopper(
        trigger === 'contextMenu' ? virtualElement : current?.closest(`.${referencePrefixCls}`) || current,
        popperRefDom.current,
        popperOptionsInner,
      )
      setTimeout(() => {
        parentContext?.registerSubPopup(id, popperRef.current)
      }, 10)
    }

    return () => {
      popperInstance.current?.destroy()
    }
  }, [exist])

  if (children === null || typeof children === 'undefined') {
    return null
  }

  const arrowStyle: Record<string, string> = {
    [`--arrowSize`]: arrowSize + 'px',
  }

  const popperContainerProps = {
    ref: popperRefDom,
    style: { ...(arrow ? arrowStyle : {}), ...popperOuterStyle },
    className: classnames(popperPrefixCls, { hidden: !visibleInner }, popperOuterClassName),
  }

  const popperProps = {
    className: classnames(
      [`${popperPrefixCls}-${placementInner}`],
      { [`${popperPrefixCls}-${placementInner}-out`]: !visibleInner },
      {
        [`${popperPrefixCls}-${placementInner}-in`]: visibleInner,
      },
      prefixCls,
      popperClassName,
      className,
    ),
    style: { ...popperStyle, ...style },
    onMouseOver: trigger === 'hover' ? () => onTriggerInner(true, 'hover', mouseEnterDelay) : undefined,
    onMouseLeave: trigger === 'hover' ? () => onTriggerInner(false, 'hover', mouseLeaveDelay) : undefined,
    onAnimationEnd: onPopperAnimationEnd,
    onTransitionEnd: onPopperAnimationEnd,
  }

  const referenceProps = {
    ref: referenceRef,
    className: classnames(referenceElement?.props?.className, referencePrefixCls),
  }

  return (
    <>
      {React.cloneElement(referenceElement, referenceProps)}
      {exist &&
        container &&
        ReactDOM.createPortal(
          <TriggerContext.Provider value={context}>
            <div {...popperContainerProps}>
              <div {...popperProps}>
                {popperElement}
                {arrow && <div className="arrow" data-popper-arrow="" />}
              </div>
            </div>
          </TriggerContext.Provider>,
          container,
        )}
    </>
  )
})

Popper.displayName = 'Popper'

export default Popper
