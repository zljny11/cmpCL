import { utilities as csUtils } from '@cornerstonejs/core';

const scalingPerImageId = {};

function add(imageId, scalingMetaData) {
  const imageURI = csUtils.imageIdToURI(imageId);
  scalingPerImageId[imageURI] = scalingMetaData;
}

function get(type, imageId) {
  if (type === 'scalingModule') {
    const imageURI = csUtils.imageIdToURI(imageId);
    return scalingPerImageId[imageURI];
  }
}

const ptScalingMetaData = { add, get };

export default ptScalingMetaData;
