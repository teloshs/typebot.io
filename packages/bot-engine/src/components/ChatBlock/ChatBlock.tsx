import React, { useEffect, useRef, useState } from 'react'
import { TransitionGroup, CSSTransition } from 'react-transition-group'
import { AvatarSideContainer } from './AvatarSideContainer'
import { LinkedTypebot, useTypebot } from '../../contexts/TypebotContext'
import {
  isBubbleStep,
  isBubbleStepType,
  isChoiceInput,
  isDefined,
  isInputStep,
  isIntegrationStep,
  isLogicStep,
} from 'utils'
import { executeLogic } from 'services/logic'
import { executeIntegration } from 'services/integration'
import { parseRetryStep, stepCanBeRetried } from 'services/inputs'
import { parseVariables } from '../../services/variable'
import { useAnswers } from 'contexts/AnswersContext'
import { BubbleStep, InputStep, PublicTypebot, Step } from 'models'
import { HostBubble } from './ChatStep/bubbles/HostBubble'
import { InputChatStep } from './ChatStep/InputChatStep'
import { getLastChatStepType } from '../../services/chat'

type ChatBlockProps = {
  steps: Step[]
  startStepIndex: number
  blockTitle: string
  onScroll: () => void
  onBlockEnd: (
    edgeId?: string,
    updatedTypebot?: PublicTypebot | LinkedTypebot
  ) => void
}

type ChatDisplayChunk = { bubbles: BubbleStep[]; input?: InputStep }

export const ChatBlock = ({
  steps,
  startStepIndex,
  blockTitle,
  onScroll,
  onBlockEnd,
}: ChatBlockProps) => {
  const {
    currentTypebotId,
    typebot,
    updateVariableValue,
    createEdge,
    apiHost,
    isPreview,
    onNewLog,
    injectLinkedTypebot,
    linkedTypebots,
    setCurrentTypebotId,
    pushEdgeIdInLinkedTypebotQueue,
  } = useTypebot()
  const { resultValues, updateVariables } = useAnswers()
  const [processedSteps, setProcessedSteps] = useState<Step[]>([])
  const [displayedChunks, setDisplayedChunks] = useState<ChatDisplayChunk[]>([])

  const insertStepInStack = (nextStep: Step) => {
    setProcessedSteps([...processedSteps, nextStep])
    if (isBubbleStep(nextStep)) {
      const lastStepType = getLastChatStepType(processedSteps)
      lastStepType && isBubbleStepType(lastStepType)
        ? setDisplayedChunks(
            displayedChunks.map((c, idx) =>
              idx === displayedChunks.length - 1
                ? { bubbles: [...c.bubbles, nextStep] }
                : c
            )
          )
        : setDisplayedChunks([...displayedChunks, { bubbles: [nextStep] }])
    }
    if (isInputStep(nextStep)) {
      return displayedChunks.length === 0 ||
        isDefined(displayedChunks[displayedChunks.length - 1].input)
        ? setDisplayedChunks([
            ...displayedChunks,
            { bubbles: [], input: nextStep },
          ])
        : setDisplayedChunks(
            displayedChunks.map((c, idx) =>
              idx === displayedChunks.length - 1 ? { ...c, input: nextStep } : c
            )
          )
    }
  }

  useEffect(() => {
    const nextStep = steps[startStepIndex]
    if (nextStep) insertStepInStack(nextStep)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    onScroll()
    onNewStepDisplayed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedSteps])

  const onNewStepDisplayed = async () => {
    const currentStep = [...processedSteps].pop()
    if (!currentStep) return
    if (isLogicStep(currentStep)) {
      const { nextEdgeId, linkedTypebot } = await executeLogic(currentStep, {
        isPreview,
        apiHost,
        typebot,
        linkedTypebots,
        updateVariableValue,
        updateVariables,
        injectLinkedTypebot,
        onNewLog,
        createEdge,
        setCurrentTypebotId,
        pushEdgeIdInLinkedTypebotQueue,
        currentTypebotId,
      })
      nextEdgeId ? onBlockEnd(nextEdgeId, linkedTypebot) : displayNextStep()
    }
    if (isIntegrationStep(currentStep)) {
      const nextEdgeId = await executeIntegration({
        step: currentStep,
        context: {
          apiHost,
          typebotId: currentTypebotId,
          blockId: currentStep.blockId,
          stepId: currentStep.id,
          variables: typebot.variables,
          isPreview,
          updateVariableValue,
          updateVariables,
          resultValues,
          blocks: typebot.blocks,
          onNewLog,
        },
      })
      nextEdgeId ? onBlockEnd(nextEdgeId) : displayNextStep()
    }
    if (currentStep.type === 'start') onBlockEnd(currentStep.outgoingEdgeId)
  }

  const displayNextStep = (answerContent?: string, isRetry?: boolean) => {
    onScroll()
    const currentStep = [...processedSteps].pop()
    if (currentStep) {
      if (isRetry && stepCanBeRetried(currentStep))
        return insertStepInStack(
          parseRetryStep(currentStep, typebot.variables, createEdge)
        )
      if (
        isInputStep(currentStep) &&
        currentStep.options?.variableId &&
        answerContent
      ) {
        updateVariableValue(currentStep.options.variableId, answerContent)
      }
      const isSingleChoiceStep =
        isChoiceInput(currentStep) && !currentStep.options.isMultipleChoice
      if (isSingleChoiceStep) {
        const nextEdgeId = currentStep.items.find(
          (i) => i.content === answerContent
        )?.outgoingEdgeId
        if (nextEdgeId) return onBlockEnd(nextEdgeId)
      }

      if (currentStep?.outgoingEdgeId || processedSteps.length === steps.length)
        return onBlockEnd(currentStep.outgoingEdgeId)
    }
    const nextStep = steps[processedSteps.length + startStepIndex]
    nextStep ? insertStepInStack(nextStep) : onBlockEnd()
  }

  const avatarSrc = typebot.theme.chat.hostAvatar?.url

  return (
    <div className="flex w-full" data-block-name={blockTitle}>
      <div className="flex flex-col w-full min-w-0">
        {displayedChunks.map((chunk, idx) => (
          <ChatChunks
            key={idx}
            displayChunk={chunk}
            hostAvatar={{
              isEnabled: typebot.theme.chat.hostAvatar?.isEnabled ?? true,
              src: avatarSrc && parseVariables(typebot.variables)(avatarSrc),
            }}
            onDisplayNextStep={displayNextStep}
          />
        ))}
      </div>
    </div>
  )
}

type Props = {
  displayChunk: ChatDisplayChunk
  hostAvatar: { isEnabled: boolean; src?: string }
  onDisplayNextStep: (answerContent?: string, isRetry?: boolean) => void
}
const ChatChunks = ({
  displayChunk: { bubbles, input },
  hostAvatar,
  onDisplayNextStep,
}: Props) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const avatarSideContainerRef = useRef<any>()

  useEffect(() => {
    refreshTopOffset()
  })

  const refreshTopOffset = () =>
    avatarSideContainerRef.current?.refreshTopOffset()

  return (
    <>
      <div className="flex">
        {hostAvatar.isEnabled && bubbles.length > 0 && (
          <AvatarSideContainer
            ref={avatarSideContainerRef}
            hostAvatarSrc={hostAvatar.src}
          />
        )}
        <div className="flex-1" style={{ marginRight: '50px' }}>
          <TransitionGroup>
            {bubbles.map((step) => (
              <CSSTransition
                key={step.id}
                classNames="bubble"
                timeout={500}
                unmountOnExit
              >
                <HostBubble
                  step={step}
                  onTransitionEnd={() => {
                    onDisplayNextStep()
                    refreshTopOffset()
                  }}
                />
              </CSSTransition>
            ))}
          </TransitionGroup>
        </div>
      </div>
      <CSSTransition
        classNames="bubble"
        timeout={500}
        unmountOnExit
        in={isDefined(input)}
      >
        {input && (
          <InputChatStep
            step={input}
            onTransitionEnd={onDisplayNextStep}
            hasAvatar={hostAvatar.isEnabled}
          />
        )}
      </CSSTransition>
    </>
  )
}
