import prisma from 'libs/prisma'
import { Typebot } from 'models'
import { NextApiRequest, NextApiResponse } from 'next'
import { authenticateUser } from 'services/api/utils'
import { parseSampleResult } from 'services/api/webhooks'
import { methodNotAllowed } from 'utils'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const user = await authenticateUser(req)
    if (!user) return res.status(401).json({ message: 'Not authenticated' })
    const typebotId = req.query.typebotId.toString()
    const stepId = req.query.blockId.toString()
    const typebot = (await prisma.typebot.findUnique({
      where: { id_ownerId: { id: typebotId, ownerId: user.id } },
    })) as unknown as Typebot | undefined
    if (!typebot) return res.status(400).send({ message: 'Typebot not found' })
    const step = typebot.blocks
      .flatMap((b) => b.steps)
      .find((s) => s.id === stepId)
    if (!step) return res.status(404).send({ message: 'Block not found' })
    return res.send(parseSampleResult(typebot)(step.blockId))
  }
  methodNotAllowed(res)
}

export default handler
