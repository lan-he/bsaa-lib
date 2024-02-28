import {
    hexlify,
    concat,
    recoverAddress,
    toUtf8Bytes,
    sha256,
    defaultAbiCoder,
    keccak256,
} from 'ethers/lib/utils'
import { utils, providers } from 'ethers'
import { addDefaultLocalNetwork } from '@arbitrum/sdk'
import { NodeInterface__factory } from '@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory'
import { NODE_INTERFACE_ADDRESS } from '@arbitrum/sdk/dist/lib/dataEntities/constants'

import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

export function setupCounter(element: HTMLButtonElement) {
    // 测试方法
    let counter = 0
    const setCounter = (count: number) => {
        counter = count
        element.innerHTML = `count is ${counter}`
    }
    element.addEventListener('click', () => setCounter(++counter))
    // element.addEventListener('click', () => {})
    setCounter(0)
}
export function convertToEthSignature(bitSignature: string): string {
    // 还原签名结果
    let buf = Buffer.from(bitSignature, 'base64')
    var i = buf.slice(0, 1)[0] - 27 - 4
    if (i < 0) {
        i = i + 4
    }
    var r = buf.slice(1, 33)
    var s = buf.slice(33, 65)
    // checkArgument(i === 0 || i === 1 || i === 2 || i === 3, new Error('i must be 0, 1, 2, or 3'));
    // checkArgument(r.length === 32, new Error('r must be 32 bytes'));
    // checkArgument(s.length === 32, new Error('s must be 32 bytes'));
    return hexlify(concat([r, s, i ? '0x1c' : '0x1b']))
}

export function recoverEthAddress(bitSignature: string, message: string): string {
    // 生成eoa地址
    const digest = magicHash(message)
    const ethSignature = convertToEthSignature(bitSignature)
    return recoverAddress(digest, ethSignature)
}
export function magicHash(data: string): string {
    const dataBytes = toUtf8Bytes(data)
    const bit_message = concat([
        toUtf8Bytes('\x18Bitcoin Signed Message:\n'),
        hexlify(dataBytes.length),
        dataBytes,
    ])
    return sha256(sha256(bit_message))
}
export const gasEstimator = async (
    txData: string,
    arbProvider: string = 'https://sepolia-rollup.arbitrum.io/rpc'
) => {
    try {
        addDefaultLocalNetwork()
    } catch (error) {}
    const baseL2Provider = new providers.StaticJsonRpcProvider(arbProvider)
    const destinationAddress = '0x1234563d5de0d7198451f87bcbf15aefd00d434d'
    // txData = '0x'
    // Instantiation of the NodeInterface object
    const nodeInterface = NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, baseL2Provider)

    // Getting the estimations from NodeInterface.GasEstimateComponents()
    // ------------------------------------------------------------------
    const gasEstimateComponents = await nodeInterface.callStatic.gasEstimateComponents(
        destinationAddress,
        false,
        '0x',
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
    // const l1Cost = l1GasEstimated.mul(l2EstimatedPrice)
    // NOTE: This is similar to 140 + utils.hexDataLength(txData);
    // const l1Size = l1Cost.div(l1EstimatedPrice)
    const l1Size = utils.hexDataLength(txData) + 140

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

    console.log('Gas estimation components')
    console.log('-------------------')
    console.log(`Full gas estimation = ${gasEstimateComponents.gasEstimate.toNumber()} units`)
    console.log(`L2 Gas (L2G) = ${L2G.toNumber()} units`)
    console.log(`L1 estimated Gas (L1G) = ${l1GasEstimated.toNumber()} units`)

    console.log(`P (L2 Gas Price) = ${utils.formatUnits(P, 'gwei')} gwei`)
    console.log(
        `L1P (L1 estimated calldata price per byte) = ${utils.formatUnits(L1P, 'gwei')} gwei`
    )
    console.log(`L1S (L1 Calldata size in bytes) = ${L1S} bytes`)

    console.log('-------------------', typeof TXFEES, TXFEES)
    console.log(`Transaction estimated fees to pay = ${utils.formatEther(TXFEES)} ETH`)
    return TXFEES
}

export const deepHexlify = (obj: any): any => {
    if (typeof obj === 'function') {
        return undefined
    }
    if (obj == null || typeof obj === 'string' || typeof obj === 'boolean') {
        return obj
    } else if (obj._isBigNumber != null || typeof obj !== 'object') {
        return hexlify(obj).replace(/^0x0/, '0x')
    }
    if (Array.isArray(obj)) {
        return obj.map((member) => deepHexlify(member))
    }
    return Object.keys(obj).reduce(
        (set, key) => ({
            ...set,
            [key]: deepHexlify(obj[key]),
        }),
        {}
    )
}
export const getUserOpHash = (op: any, entryPoint: any, chainId: any): any => {
    const userOpHash = keccak256(packUserOp(op, true))
    const enc = defaultAbiCoder.encode(
        ['bytes32', 'address', 'uint256'],
        [userOpHash, entryPoint, chainId]
    )
    return keccak256(enc)
}
export const packUserOp = (op: any, forSignature = true): any => {
    if (forSignature) {
        return defaultAbiCoder.encode(
            [
                'address',
                'uint256',
                'bytes32',
                'bytes32',
                'uint256',
                'uint256',
                'uint256',
                'uint256',
                'uint256',
                'bytes32',
            ],
            [
                op.sender,
                op.nonce,
                keccak256(op.initCode),
                keccak256(op.callData),
                op.callGasLimit,
                op.verificationGasLimit,
                op.preVerificationGas,
                op.maxFeePerGas,
                op.maxPriorityFeePerGas,
                keccak256(op.paymasterAndData),
            ]
        )
    } else {
        // for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
        return defaultAbiCoder.encode(
            [
                'address',
                'uint256',
                'bytes',
                'bytes',
                'uint256',
                'uint256',
                'uint256',
                'uint256',
                'uint256',
                'bytes',
                'bytes',
            ],
            [
                op.sender,
                op.nonce,
                op.initCode,
                op.callData,
                op.callGasLimit,
                op.verificationGasLimit,
                op.preVerificationGas,
                op.maxFeePerGas,
                op.maxPriorityFeePerGas,
                op.paymasterAndData,
                op.signature,
            ]
        )
    }
}
