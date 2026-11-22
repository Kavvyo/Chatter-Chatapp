import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface LogoProps {
  size?: number;
  color?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 32, color = '#6366f1' }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
  >
    <Path
      d="M515.072 181.76a332.8 332.8 0 0 1 0 665.6 329.728 329.728 0 0 1-141.312-31.488c-20.736-9.728-44.032-14.336-72.96-14.336-22.272 0-45.568 2.56-68.096 5.376 4.608-42.752 9.216-94.72-15.104-142.592A332.8 332.8 0 0 1 515.072 181.76m0-102.4A435.456 435.456 0 0 0 126.464 710.4c25.6 50.432-24.064 156.672 18.176 193.536 8.192 7.168 22.784 9.472 40.192 9.472 35.072 0 82.688-9.472 115.968-9.472 12.032 0 22.272 1.28 29.44 4.608A435.2 435.2 0 1 0 515.072 79.36z"
      fill={color}
    />
  </Svg>
);

export default Logo;
