type MockRootState = {
  ApiIdReducer: {
    apiId: number;
  };
};

const mockState: MockRootState = {
  ApiIdReducer: {
    apiId: 0,
  },
};

export function useAppSelector<TSelected>(selector: (state: MockRootState) => TSelected) {
  return selector(mockState);
}

export function useAppDispatch() {
  return () => undefined;
}
