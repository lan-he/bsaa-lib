import { providers, utils, Contract } from 'ethers'
import { addDefaultLocalNetwork } from '@arbitrum/sdk'
import { NodeInterface__factory } from '@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory'
import { NODE_INTERFACE_ADDRESS } from '@arbitrum/sdk/dist/lib/dataEntities/constants'
import { Provider } from '@ethersproject/providers'

/**
 * Calculate gas price in arb network
 * @param destinationAddress
 * @param txData
 * @param gasLimit
 * @param arbProvider
 * @returns
 */
export const gasEstimatorV2 = async (
    entryPoint: string,
    userOp: any,
    arbProvider: string | Provider,
    signer: string
) => {
    try {
        addDefaultLocalNetwork()
    } catch {}
    const baseL2Provider =
        typeof arbProvider === 'string'
            ? new providers.StaticJsonRpcProvider(arbProvider)
            : arbProvider

    const handleOpsABI =
        '[{"inputs":[{"components":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"uint256","name":"nonce","type":"uint256"},{"internalType":"bytes","name":"initCode","type":"bytes"},{"internalType":"bytes","name":"callData","type":"bytes"},{"internalType":"uint256","name":"callGasLimit","type":"uint256"},{"internalType":"uint256","name":"verificationGasLimit","type":"uint256"},{"internalType":"uint256","name":"preVerificationGas","type":"uint256"},{"internalType":"uint256","name":"maxFeePerGas","type":"uint256"},{"internalType":"uint256","name":"maxPriorityFeePerGas","type":"uint256"},{"internalType":"bytes","name":"paymasterAndData","type":"bytes"},{"internalType":"bytes","name":"signature","type":"bytes"}],"internalType":"struct UserOperation[]","name":"ops","type":"tuple[]"},{"internalType":"address payable","name":"beneficiary","type":"address"}],"name":"handleOps","outputs":[],"stateMutability":"nonpayable","type":"function"}]'
    const handleOpsContract = new Contract(entryPoint, handleOpsABI, baseL2Provider)

    const handleOpsData = handleOpsContract.interface.encodeFunctionData('handleOps', [
        [userOp],
        signer,
    ])

    // Instantiation of the NodeInterface object
    const nodeInterface = NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, baseL2Provider)

    // Getting the estimations from NodeInterface.GasEstimateComponents()
    // ------------------------------------------------------------------
    const gasEstimateComponents = await nodeInterface.callStatic.gasEstimateComponents(
        entryPoint,
        false,
        handleOpsData,
        {
            blockTag: 'latest',
        }
    )

    // Getting useful values for calculating the formula
    const l1GasEstimated = gasEstimateComponents.gasEstimateForL1
    const l2GasUsed = gasEstimateComponents.gasEstimate.sub(gasEstimateComponents.gasEstimateForL1)
    const l2EstimatedPrice = gasEstimateComponents.baseFee
    let l1EstimatedPrice = gasEstimateComponents.l1BaseFeeEstimate.mul(16)

    // Calculating some extra values to be able to apply all variables of the formula
    // -------------------------------------------------------------------------------
    // NOTE: This one might be a bit confusing, but l1GasEstimated (B in the formula) is calculated based on l2 gas fees
    const l1Cost = l1GasEstimated.mul(l2EstimatedPrice)
    // NOTE: This is similar to 140 + utils.hexDataLength(txData);
    const l1Size = l1Cost.div(l1EstimatedPrice)

    // Getting the result of the formula
    // ---------------------------------
    // Setting the basic variables of the formula
    const P = l2EstimatedPrice
    const L2G = l2GasUsed

    const L1P = l1EstimatedPrice
    const L1S = l1Size

    // L1C (L1 Cost) = L1P * L1S
    const L1C = L1P.mul(L1S)

    // B (Extra Buffer) = L1C / P
    const B = L1C.div(P)

    // G (Gas Limit) = L2G + B
    const G = L2G.add(B)

    // TXFEES (Transaction fees) = P * G
    const TXFEES = P.mul(G)

    // console.log('-------------------', typeof TXFEES, TXFEES)
    console.log(`Transaction estimated fees to pay = ${utils.formatEther(TXFEES)} ETH`)
    // return TXFEES.div(l2GasUsed.sub(50000))
    return {
        TXFEES,
        // TXFEES: TXFEES.div(l2GasUsed.sub(50000)),
        l2GasUsed,
    }
}
