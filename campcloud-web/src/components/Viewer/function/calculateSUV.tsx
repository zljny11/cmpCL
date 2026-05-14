// @ts-nocheck
import { calculateSUVScalingFactors } from '@cornerstonejs/calculate-suv';
import getPTImageIdInstanceMetadata from "./helpers/getPTImageIdInstanceMetadata";
import ptScalingMetaData from './helpers/ptScalingMetaDataProvider';
import { prefetchMetadataInformation } from './helpers/convertMultiframeImageIds';

const calculateSUV = async (ImageDatas: any[]) => {
  for (const ImageData of ImageDatas) {
    const { scanMode, ImageIds } = ImageData
    if (scanMode === 'PT') {
      await prefetchMetadataInformation(ImageIds);
      const InstanceMetadataArray = [];
      ImageIds.forEach((imageId: string) => {
        const instanceMetadata = getPTImageIdInstanceMetadata(imageId);

        // TODO: Temporary fix because static-wado is producing a string, not an array of values
        // (or maybe dcmjs isn't parsing it correctly?)
        // It's showing up like 'DECY\\ATTN\\SCAT\\DTIM\\RAN\\RADL\\DCAL\\SLSENS\\NORM'
        // but calculate-suv expects ['DECY', 'ATTN', ...]
        if (typeof instanceMetadata.CorrectedImage === 'string') {
          instanceMetadata.CorrectedImage =
            instanceMetadata.CorrectedImage.split('\\');
        }

        if (instanceMetadata) {
          InstanceMetadataArray.push(instanceMetadata);
        }
      });
      if (InstanceMetadataArray.length) {
        try {
          const suvScalingFactors = calculateSUVScalingFactors(
            InstanceMetadataArray
          );
          InstanceMetadataArray.forEach((instanceMetadata, index) => {
            ptScalingMetaData.add(
              ImageIds[index],
              suvScalingFactors[index]
            );
          });
        } catch (error) {
          console.log(error);
        }
      }
    }
  }
}

export default calculateSUV