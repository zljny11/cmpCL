// @ts-nocheck
import { Dropdown, MenuProps } from 'antd';
import { VscGithubInverted } from "react-icons/vsc";
import React from 'react'
import './index.less'

type Props = {
  icon: React.JSX.Element,

}

const items: MenuProps['items'] = [
  {
    label: '1st menu item',
    key: '1',
  },
  {
    label: '2nd menu item',
    key: '2',
  },
  {
    label: '3rd menu item',
    key: '3',
    danger: true,
  },
  {
    label: '4rd menu item',
    key: '4',
    danger: true,
    disabled: true,
  },
];

const DropdownToolTipBtn = (props: Props) => {
  return (
    <div className='test'>

    </div>
  )
}

export default DropdownToolTipBtn;