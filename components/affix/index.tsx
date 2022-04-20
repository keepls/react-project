import * as React from 'react'
import classNames from 'classnames'
import omit from 'rc-util/lib/omit'
import ResizeObserver from 'rc-resize-observer'
import {ConfigContext,ConfigConsumerProps} from '../config-provider'
import {throttleByAnimationFrameDecorator} from '../_util/throttleByAnimationFrame'

import {
    addObserveTarget,
    removeObserveTarget,
    getTargetRect,
    getFixedTop,
    getFixedBottom
} from './utils'

function getDefaultTarget(){
    return typeof window !== 'undefined' ? window : null;
}

// Affix

export interface AffixProps{
    // 距离窗口顶部达到指定偏移量后触发
    offsetTop?:number
    // 距离窗口底部达到指定偏移量后触发
    offsetBottom?:number
    style?:React.CSSProperties
    // 固定状态改变时触发的回调函数
    onChange?:(affixed?:boolean)=>void
    // 设置Affix 需要监听其滚动事件的元素,值为一个返回对应dom元素的函数
    target?:()=>Window | HTMLElement | null
    perfixCls?:string
    className?:string
    children:React.ReactNode
}

interface InternalAffixProps extends AffixProps{
    affixPrefixCls:string
}

enum AffixState{
    None,
    Prepare,
}
export interface AffixState{
    affixStyle?:React.CSSProperties
    placeholderStyle?:React.CSSProperties
    status:AffixState
    lastAffix:boolean
    prevTarget:Window|HTMLElement|null
}

class Affix extends React.Component<InternalAffixProps,AffixState>{
    static contextType=ConfigContext
    state: AffixState={
        status:AffixStatus.None,
        lastAffix:false,
        prevTarget:null,
    }

    placeholderNode:HTMLDivElement
    fixedNode:HTMLDivElement
    private timeout:any
    context:ConfigConsumerProps

    private getTargetFunc(){
        const {getTargetContainer}=this.context
        const {target}=this.props
        if (target!==undefined) {
            return target
        }
        return getTargetContainer || getDefaultTarget
    }
    // event handler
    componentDidMount(){
        const targetFunc=this.getTargetFunc()
        if (targetFunc) {
            this.timeout=setTimeout(()=>{
                addObserveTarget(targetFunc,this)
                this.updatePosition()
            })
        }
    }

    componentDidUpdate(prevProps:AffixProps){
        const {prevTarget}=this.state
        const targetFunc=this.getTargetFunc()
        const newTarget=targetFunc?.() || null

        if (prevTarget!==newTarget) {
            removeObserveTarget(this)
            if (newTarget) {
                addObserveTarget(newTarget,this)
                this.updatePosition()
            }
            this.setState({prevTarget:newTarget})
        }
        if (
            prevProps.offsetTop!==this.props.offsetTop ||
            prevProps.offsetBottom!==this.props.offsetBottom
        ) {
            this.updatePosition()
        }
        this.measure()
    }
    componentWillUnmount(){
        clearTimeout(this.timeout)
        removeObserveTarget(this)
        (this.updatePosition as any).cancel()
        (this.lazyUpdatePositon as any).cancel()
    }
    
    getOffsetTop=()=>{
        const {offsetBottom,offsetTop} =this.props
        return offsetBottom===undefined && offsetTop===undefined ? 0:offsetTop
    }
    getOffsetBottom=()=>this.props.offsetBottom

    savePlaceholderNode=(node:HTMLDivElement)=>{
        this.placeholderNode=node
    }
    saveFixedNode=(node:HTMLDivElement)=>{
        this.fixedNode=node
    }
    // measure
    measure=()=>{
        const {status,lastAffix}=this.state
        const {onChange}=this.props
        const targetFunc=this.getTargetFunc()
        if (status!==AffixStatus.Prepare || !this.fixedNode || !this.placeholderNode || !targetFunc) {
            return;
        }
        const offsetTop=this.getOffsetTop()
        const offsetBottom=this.getOffsetBottom()
        const targetNode=targetFunc()
        if (!targetNode) {
            return;
        }
        const newState:Partial<AffixState>={
            status:AffixStatus.Node,
        }
        const targetRect=getTargetRect(targetNode)
        const placeholderReact=getTargetRect(this.placeholderNode)
        const fixedTop=getFixedTop(placeholderReact,targetRect,offsetTop)
        const fixedBottom=getFixedBottom(placeholderReact,targetRect,offsetBottom)

        if (fixedTop!==undefined) {
            newState.affixStyle={
                position:'fixed',
                top:fixedTop,
                width:placeholderReact.width,
                height:placeholderReact.height
            }
            newState.placeholderStyle={
                width:placeholderReact.width,
                height:placeholderReact.height
            }      
        }else if(fixedBottom!==undefined){
            newState.affixStyle={
                position:'fixed',
                bottom:fixedBottom,
                width:placeholderReact.width,
                height:placeholderReact.height
            }
            newState.placeholderStyle={
                wodth:placeholderReact.width,
                height:placeholderReact.height
            }
        }

        newState.lastAffix= !!newState.affixStyle
        if (onChange && lastAffix!==newState.lastAffix) {
            onChange(newState.lastAffix)
        }
        this.setState(newState as AffixState)
    }

    // 
    prepareMeasure=()=>{
        this.setState({
            status:AffixStatus.Prepare,
            affixStyle:undefined,
            placeholderStyle:undefined

        })
        if (process.env.NODE_ENV==='test') {
            const {onTestUpdatePosition}=this.props as any
            onTestUpdatePosition?.()
        }
    }
    // handle realign logic
    @throttleByAnimationFrameDecorator()
    updatePosition(){
        this.prepareMeasure()
    }
    @throttleByAnimationFrameDecorator()
    lazyUpdatePosition(){
        const targetFunc=this.getTargetFunc()
        const {affixStyle}=this.state
        if (targetFunc && affixStyle) {
            const offsetTop=this.getOffsetTop()
            const offsetBottom=this.getOffsetBottom()
            const targetNode=targetFunc()
            if (targetNode && this.placeholderNode) {
                const targetRect=getTargetRect(targetNode)
                const placeholderReact=getTargetRect(this.placeholderNode)
                const fixedTop=getFixedTop(placeholderReact,targetRect,offsetTop)
                const fixedBottom=getFixedBottom(placeholderReact,targetRect,offsetBottom)
                if (
                    (fixedTop!==undefined && affixStyle.top===fixedTop)||
                    (fixedBottom!==undefined && affixStyle.bottom===fixedBottom)
                ) {
                    return;
                }                
            }
        }
        this.prepareMeasure()
    }
    // render
    render(){
        const {affixStyle,placeholderStyle}=this.state
        const {affixPrefixCls,children}=this.props
        const className=classNames({
            [affixPrefixCls]:!!affixStyle
        })
        let props=omit(this.props,[
            'prefixCls',
            'offsetTop',
            'offsetBottom',
            'target',
            'onChange',
            'affixPrefixCls'
        ])
        if (process.env.NODE_ENV==='test') {
            props=omit(props as typeof props & {onTestUpdatePosition:any},['onTestUpdatePosition'])

        }
        return (
            <ResizeObserver
                onResize={()=>{
                    this.updatePosition()
                }}
            >  
                <div {...props} ref={this.savePlaceholderNode}>
                    {affixStyle && <div style={placeholderStyle} aria-hidden="true" />}
                    <div className={className} ref={this.saveFixedNode} style={affixStyle}>
                        <ResizeObserver
                            onResize={()=>{
                                this.updatePosition()
                            }}
                        >
                           {children}
                        </ResizeObserver>
                    </div>
                </div>
            </ResizeObserver>
        )
    }

}

const AffixFC=React.forwardRef<Affix,AffixProps>((props,ref)=>{
    const {prefixCls,customizePrefixCls}=props
    const {getPrefixCls}=React.useContext(ConfigContext)

    const affixPrefixCls=getPrefixCls('affix',customizePrefixCls)
    const affixProps:InternalAffixProps={
        ...props,
        affixPrefixCls
    }
    return <Affix {...affixProps} ref={ref} />
})

if (process.env.NODE_ENV!=='production') {
    AffixFC.displayName='Affix'
}

export default AffixFC;
































































































































































